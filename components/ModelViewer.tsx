"use client";

import { useEffect, useRef, useState } from "react";
import { dict, type Lang } from "@/lib/i18n";

/**
 * three.js viewport for the formats a browser can draw.
 *
 * Loaders are imported on demand, so a page showing a .blend download card never pays for
 * the FBX parser, and the whole viewer stays out of the initial bundle. Draco-compressed
 * glTF works because the decoder is served from /public/draco (copied out of the three
 * package) rather than a CDN — the app must keep working on a locked-down school network.
 */
export function ModelViewer({
  src,
  ext,
  lang,
  filename,
}: {
  src: string;
  ext: string;
  lang: Lang;
  filename?: string;
}) {
  const d = dict(lang).model;
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ reset: () => void; setWireframe: (on: boolean) => void } | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();

      // Procedural studio lighting: no .hdr to download, and PBR materials still look right.
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;

      scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1f2b, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(4, 6, 5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x9fb4ff, 0.7);
      rim.position.set(-5, 2, -4);
      scene.add(rim);

      const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 5000);
      camera.position.set(2.4, 1.8, 3.2);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;

      let frame = 0;
      const animate = () => {
        frame = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const observer = new ResizeObserver(() => {
        if (!mount.clientWidth || !mount.clientHeight) return;
        camera.aspect = mount.clientWidth / mount.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      });
      observer.observe(mount);

      cleanup = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        controls.dispose();
        scene.traverse((obj) => {
          const mesh = obj as import("three").Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else if (material) material.dispose();
        });
        pmrem.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };

      // ---------------------------------------------------------------- load
      const onProgress = (event: ProgressEvent) => {
        if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
      };

      let object: import("three").Object3D | null = null;

      try {
        object = await loadByExtension(THREE, ext, src, onProgress);
      } catch (err) {
        console.error("viewer load failed", err);
        if (!disposed) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : null);
        }
        return;
      }
      if (disposed || !object) return;

      // ---------------------------------------------------------------- frame it
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z) || 1;

      // Normalise wildly different unit scales (a CAD part in mm vs a game asset in metres).
      const scale = 2.4 / extent;
      object.scale.setScalar(scale);
      object.position.sub(center.multiplyScalar(scale));

      scene.add(object);

      const distance = 3.4;
      const home = new THREE.Vector3(distance * 0.62, distance * 0.42, distance * 0.82);
      camera.position.copy(home);
      controls.target.set(0, 0, 0);
      controls.update();

      apiRef.current = {
        reset: () => {
          camera.position.copy(home);
          controls.target.set(0, 0, 0);
          controls.update();
        },
        setWireframe: (on: boolean) => {
          object?.traverse((child) => {
            const mesh = child as import("three").Mesh;
            if (!mesh.isMesh) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
              if (material && "wireframe" in material) {
                (material as import("three").MeshStandardMaterial).wireframe = on;
              }
            }
          });
        },
      };

      renderer.domElement.addEventListener("dblclick", () => apiRef.current?.reset());
      setStatus("ready");
    })();

    return () => {
      disposed = true;
      cleanup?.();
      apiRef.current = null;
    };
  }, [src, ext]);

  return (
    <div className="viewer" ref={mountRef}>
      {status === "loading" && (
        <div className="viewer-overlay">
          <div>
            <div>{d.viewerLoading}</div>
            {progress > 0 && <div className="tiny faint">{progress}%</div>}
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="viewer-overlay">
          <div>
            <div className="strong">{d.viewerFailed}</div>
            {filename && <div className="tiny faint wrap-any">{filename}</div>}
            {message && <div className="tiny faint wrap-any">{message}</div>}
          </div>
        </div>
      )}

      {status === "ready" && (
        <div className="viewer-tools">
          <span className="viewer-hint">{d.viewerControls}</span>
          <span className="row row-tight">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const next = !wireframe;
                setWireframe(next);
                apiRef.current?.setWireframe(next);
              }}
            >
              {d.wireframe}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => apiRef.current?.reset()}>
              {d.resetView}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Picks the loader for an extension and normalises everything to an Object3D. */
async function loadByExtension(
  THREE: typeof import("three"),
  ext: string,
  url: string,
  onProgress: (event: ProgressEvent) => void,
): Promise<import("three").Object3D> {
  const geometryToMesh = (geometry: import("three").BufferGeometry) => {
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xb9c2d8,
      metalness: 0.08,
      roughness: 0.62,
      flatShading: false,
      vertexColors: Boolean(geometry.getAttribute("color")),
    });
    return new THREE.Mesh(geometry, material);
  };

  switch (ext) {
    case "glb":
    case "gltf": {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import("three/examples/jsm/loaders/GLTFLoader.js"),
        import("three/examples/jsm/loaders/DRACOLoader.js"),
      ]);
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath("/draco/gltf/");
      loader.setDRACOLoader(draco);
      try {
        const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
        loader.setMeshoptDecoder(MeshoptDecoder);
      } catch {
        // Meshopt is optional; only some exporters use it.
      }
      const gltf = await loader.loadAsync(url, onProgress);
      draco.dispose();
      return gltf.scene;
    }

    case "obj": {
      const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
      return await new OBJLoader().loadAsync(url, onProgress);
    }

    case "stl": {
      const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
      return geometryToMesh(await new STLLoader().loadAsync(url, onProgress));
    }

    case "ply": {
      const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
      return geometryToMesh(await new PLYLoader().loadAsync(url, onProgress));
    }

    case "fbx": {
      const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");
      return await new FBXLoader().loadAsync(url, onProgress);
    }

    case "3mf": {
      const { ThreeMFLoader } = await import("three/examples/jsm/loaders/3MFLoader.js");
      return await new ThreeMFLoader().loadAsync(url, onProgress);
    }

    case "dae": {
      const { ColladaLoader } = await import("three/examples/jsm/loaders/ColladaLoader.js");
      const collada = await new ColladaLoader().loadAsync(url, onProgress);
      if (!collada?.scene) throw new Error("This Collada file has no scene");
      return collada.scene;
    }

    case "3ds": {
      const { TDSLoader } = await import("three/examples/jsm/loaders/TDSLoader.js");
      return await new TDSLoader().loadAsync(url, onProgress);
    }

    case "wrl":
    case "vrml": {
      const { VRMLLoader } = await import("three/examples/jsm/loaders/VRMLLoader.js");
      return await new VRMLLoader().loadAsync(url, onProgress);
    }

    default:
      throw new Error(`No loader for .${ext}`);
  }
}
