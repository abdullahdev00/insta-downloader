import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  icon: string;
  speed: number;
  size: number;
  opacity: number;
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setupCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const createParticles = () => {
      const icons = ['❤️', '📷', '📸', '🎥', '✨', '💖', '🌟', '📱'];
      particlesRef.current = [];
      
      for (let i = 0; i < 15; i++) {
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          icon: icons[Math.floor(Math.random() * icons.length)],
          speed: Math.random() * 1.5 + 0.5,
          size: Math.random() * 15 + 10,
          opacity: Math.random() * 0.3 + 0.1
        });
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particlesRef.current.forEach(particle => {
        ctx.globalAlpha = particle.opacity;
        ctx.font = `${particle.size}px Arial`;
        ctx.fillText(particle.icon, particle.x, particle.y);
        
        particle.y -= particle.speed;
        particle.x += Math.sin(particle.y * 0.01) * 0.5;
        
        if (particle.y < -50) {
          particle.y = canvas.height + 50;
          particle.x = Math.random() * canvas.width;
        }
      });
      
      animationRef.current = requestAnimationFrame(animate);
    };

    setupCanvas();
    createParticles();
    animate();

    const handleResize = () => {
      setupCanvas();
      createParticles();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: 'transparent' }}
    />
  );
}