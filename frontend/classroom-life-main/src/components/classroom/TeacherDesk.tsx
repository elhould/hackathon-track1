interface TeacherDeskProps {
  position: [number, number, number];
}

export function TeacherDesk({ position }: TeacherDeskProps) {
  const deskColor = "#5c4033"; // Darker, more authoritative desk
  const legColor = "#3d2817";
  
  return (
    <group position={position}>
      {/* Larger desk top */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.15, 1.2]} />
        <meshLambertMaterial color={deskColor} />
      </mesh>
      
      {/* Desk body/drawers */}
      <mesh position={[0, 0.37, 0]} castShadow>
        <boxGeometry args={[1.8, 0.6, 1]} />
        <meshLambertMaterial color={deskColor} />
      </mesh>
      
      {/* Drawer fronts */}
      {[0.25, -0.25].map((y, i) => (
        <mesh key={i} position={[0.6, 0.37 + y * 0.8, 0.51]} castShadow>
          <boxGeometry args={[0.7, 0.25, 0.02]} />
          <meshLambertMaterial color={legColor} />
        </mesh>
      ))}
      
      {/* Drawer handles */}
      {[0.25, -0.25].map((y, i) => (
        <mesh key={i} position={[0.6, 0.37 + y * 0.8, 0.53]}>
          <boxGeometry args={[0.15, 0.04, 0.04]} />
          <meshLambertMaterial color="#b8860b" />
        </mesh>
      ))}
      
      {/* Items on desk */}
      {/* Apple */}
      <mesh position={[-0.6, 0.95, 0.3]} castShadow>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshLambertMaterial color="#cc3333" />
      </mesh>
      {/* Apple stem */}
      <mesh position={[-0.6, 1.08, 0.3]}>
        <cylinderGeometry args={[0.02, 0.02, 0.08]} />
        <meshLambertMaterial color="#4a3728" />
      </mesh>
      
      {/* Stack of books */}
      <group position={[0.5, 0.83, -0.3]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[0.35, 0.08, 0.25]} />
          <meshLambertMaterial color="#4a5568" />
        </mesh>
        <mesh position={[0.02, 0.14, 0]} castShadow>
          <boxGeometry args={[0.33, 0.08, 0.24]} />
          <meshLambertMaterial color="#744210" />
        </mesh>
        <mesh position={[-0.01, 0.23, 0]} castShadow>
          <boxGeometry args={[0.34, 0.08, 0.23]} />
          <meshLambertMaterial color="#2c5282" />
        </mesh>
      </group>
    </group>
  );
}
