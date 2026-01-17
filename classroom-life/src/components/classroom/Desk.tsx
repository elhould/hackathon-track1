import * as THREE from 'three';

interface DeskProps {
  position: [number, number, number];
}

export function Desk({ position }: DeskProps) {
  const deskColor = "#8b7355"; // Chunky wooden desk
  const legColor = "#6b5344";
  
  return (
    <group position={position}>
      {/* Desk top - chunky Sims style */}
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.12, 0.9]} />
        <meshLambertMaterial color={deskColor} />
      </mesh>
      
      {/* Desk front panel */}
      <mesh position={[0, 0.45, 0.35]} castShadow>
        <boxGeometry args={[1.3, 0.4, 0.08]} />
        <meshLambertMaterial color={deskColor} />
      </mesh>
      
      {/* Legs - chunky */}
      {[
        [-0.55, 0.35, -0.3],
        [0.55, 0.35, -0.3],
        [-0.55, 0.35, 0.3],
        [0.55, 0.35, 0.3],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <boxGeometry args={[0.12, 0.7, 0.12]} />
          <meshLambertMaterial color={legColor} />
        </mesh>
      ))}
      
      {/* Chair */}
      <group position={[0, 0, 0.9]}>
        {/* Seat */}
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.5, 0.08, 0.5]} />
          <meshLambertMaterial color="#d4a574" />
        </mesh>
        {/* Back */}
        <mesh position={[0, 0.75, -0.22]} castShadow>
          <boxGeometry args={[0.5, 0.5, 0.08]} />
          <meshLambertMaterial color="#d4a574" />
        </mesh>
        {/* Chair legs */}
        {[
          [-0.2, 0.22, -0.2],
          [0.2, 0.22, -0.2],
          [-0.2, 0.22, 0.2],
          [0.2, 0.22, 0.2],
        ].map((pos, i) => (
          <mesh key={i} position={pos as [number, number, number]} castShadow>
            <boxGeometry args={[0.06, 0.45, 0.06]} />
            <meshLambertMaterial color={legColor} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
