interface BookshelfProps {
  position: [number, number, number];
}

export function Bookshelf({ position }: BookshelfProps) {
  const shelfColor = "#8b6914";
  const bookColors = ["#c41e3a", "#1e4d8c", "#2e8b57", "#8b4513", "#4a0080", "#cc7722"];
  
  return (
    <group position={position}>
      {/* Main frame */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[1.2, 3, 0.4]} />
        <meshLambertMaterial color={shelfColor} />
      </mesh>
      
      {/* Shelves */}
      {[0.5, 1.5, 2.5].map((y, i) => (
        <mesh key={i} position={[0, y, 0.02]} castShadow>
          <boxGeometry args={[1.1, 0.08, 0.38]} />
          <meshLambertMaterial color={shelfColor} />
        </mesh>
      ))}
      
      {/* Books on shelves */}
      {[0.7, 1.7, 2.7].map((shelfY, shelfIndex) => (
        <group key={shelfIndex} position={[0, shelfY, 0.02]}>
          {Array.from({ length: 5 }).map((_, bookIndex) => {
            const height = 0.35 + Math.random() * 0.15;
            const width = 0.12 + Math.random() * 0.06;
            const colorIndex = (shelfIndex * 5 + bookIndex) % bookColors.length;
            
            return (
              <mesh
                key={bookIndex}
                position={[-0.4 + bookIndex * 0.2, height / 2, 0]}
                castShadow
              >
                <boxGeometry args={[width, height, 0.25]} />
                <meshLambertMaterial color={bookColors[colorIndex]} />
              </mesh>
            );
          })}
        </group>
      ))}
    </group>
  );
}
