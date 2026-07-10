import * as THREE from 'three';
import { useRef, useState, memo } from 'react';
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber';
import {
  useFBO,
  Preload,
  ScrollControls,
  MeshTransmissionMaterial
} from '@react-three/drei';
import { easing } from 'maath';

export default function FluidGlass({ mode = 'lens', lensProps = {}, barProps = {}, cubeProps = {} }) {
  const Wrapper = mode === 'bar' ? Bar : mode === 'cube' ? Cube : Lens;
  const rawOverrides = mode === 'bar' ? barProps : mode === 'cube' ? cubeProps : lensProps;

  const modeProps = { ...rawOverrides };
  delete modeProps.navItems;

  return (
    <div className="w-full h-full absolute inset-0 pointer-events-none opacity-60">
      <Canvas camera={{ position: [0, 0, 20], fov: 15 }} gl={{ alpha: true }}>
        <ScrollControls damping={0.2} pages={1} distance={0.4}>
          <Wrapper modeProps={modeProps}>
            <Preload />
          </Wrapper>
        </ScrollControls>
      </Canvas>
    </div>
  );
}

const ModeWrapper = memo(function ModeWrapper({
  children,
  geometry,
  followPointer = true,
  modeProps = {},
  ...props
}) {
  const ref = useRef();
  const buffer = useFBO();
  const { viewport: vp } = useThree();
  const [scene] = useState(() => new THREE.Scene());

  useFrame((state, delta) => {
    const { gl, viewport, pointer, camera } = state;
    const v = viewport.getCurrentViewport(camera, [0, 0, 15]);

    const destX = followPointer ? (pointer.x * v.width) / 2.5 : 0;
    const destY = followPointer ? (pointer.y * v.height) / 2.5 : 0;
    if (ref.current) {
      easing.damp3(ref.current.position, [destX, destY, 15], 0.15, delta);
    }

    gl.setRenderTarget(buffer);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    gl.setClearColor(0x000000, 0);
  });

  const { scale, ior, thickness, anisotropy, chromaticAberration, ...extraMat } = modeProps;

  return (
    <>
      {createPortal(children, scene)}
      <mesh scale={[vp.width, vp.height, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} transparent opacity={0.1} />
      </mesh>
      <mesh ref={ref} scale={scale ?? 2.8} {...props}>
        {geometry}
        <MeshTransmissionMaterial
          buffer={buffer.texture}
          ior={ior ?? 1.25}
          thickness={thickness ?? 2.0}
          anisotropy={anisotropy ?? 0.15}
          chromaticAberration={chromaticAberration ?? 0.08}
          roughness={0.05}
          transmission={1.0}
          {...extraMat}
        />
      </mesh>
    </>
  );
});

function Lens({ modeProps, ...p }) {
  return (
    <ModeWrapper
      geometry={<cylinderGeometry args={[1.2, 1.2, 0.4, 64]} />}
      rotation-x={Math.PI / 2}
      followPointer
      modeProps={modeProps}
      {...p}
    />
  );
}

function Cube({ modeProps, ...p }) {
  return (
    <ModeWrapper
      geometry={<boxGeometry args={[1.2, 1.2, 1.2]} />}
      followPointer
      modeProps={modeProps}
      {...p}
    />
  );
}

function Bar({ modeProps = {}, ...p }) {
  return (
    <ModeWrapper
      geometry={<capsuleGeometry args={[0.4, 2.4, 8, 32]} />}
      rotation-z={Math.PI / 2}
      followPointer
      modeProps={modeProps}
      {...p}
    />
  );
}
