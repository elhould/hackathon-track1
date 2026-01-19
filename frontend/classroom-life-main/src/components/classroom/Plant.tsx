interface PlantProps {
  position: [number, number, number];
}

export function Plant({ position }: PlantProps) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.2, 0.5, 8]} />
        <meshLambertMaterial color="#cd853f" />
      </mesh>
      
      {/* Pot rim */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.25, 0.08, 8]} />
        <meshLambertMaterial color="#cd853f" />
      </mesh>
      
      {/* Soil */}
      <mesh position={[0, 0.48, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.08, 8]} />
        <meshLambertMaterial color="#3d2817" />
      </mesh>
      
      {/* Plant leaves - simple chunky style */}
      {[0, 60, 120, 180, 240, 300].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * 0.1;
        const z = Math.sin(rad) * 0.1;
        const height = 0.4 + (i % 2) * 0.15;
        
        return (
          <mesh
            key={i}
            position={[x, 0.7 + height / 2, z]}
            rotation={[0.2, rad, 0.3 - (i % 2) * 0.2]}
            castShadow
          >
            <boxGeometry args={[0.08, height, 0.25]} />
            <meshLambertMaterial color="#228b22" />
          </mesh>
        );
      })}
    </group>
  );
}
