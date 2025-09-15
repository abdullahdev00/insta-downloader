import { ArrowRight, Download, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HeroSection() {
  const scrollToMagicInput = () => {
    const element = document.getElementById('magic-input-section');
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-mesh-gradient opacity-30 animate-gradient-shift" 
           style={{ backgroundSize: '400% 400%' }} />
      
      {/* Floating Elements */}
      <div className="absolute top-20 left-10 text-6xl animate-float opacity-20">
        📷
      </div>
      <div className="absolute top-40 right-20 text-4xl animate-float opacity-30" style={{ animationDelay: '1s' }}>
        ❤️
      </div>
      <div className="absolute bottom-32 left-20 text-5xl animate-float opacity-25" style={{ animationDelay: '2s' }}>
        ✨
      </div>
      <div className="absolute bottom-20 right-10 text-3xl animate-float opacity-35" style={{ animationDelay: '0.5s' }}>
        📸
      </div>

      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
        <div className="mb-6 animate-pulse-glow">
          <Sparkles className="w-16 h-16 mx-auto text-primary mb-4" />
        </div>
        
        <h1 className="text-6xl md:text-8xl font-black mb-8 leading-tight">
          <span className="bg-instagram-gradient bg-clip-text text-transparent animate-gradient-shift" 
                style={{ backgroundSize: '200% 200%' }}>
            ULTIMATE
          </span>
          <br />
          <span className="text-foreground">Instagram</span>
          <br />
          <span className="bg-instagram-gradient bg-clip-text text-transparent animate-gradient-shift" 
                style={{ backgroundSize: '200% 200%', animationDelay: '1s' }}>
            Downloader
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed">
          Download any Instagram content in <span className="text-primary font-semibold">2 clicks</span> with the most 
          <span className="bg-instagram-gradient bg-clip-text text-transparent font-semibold"> stunning interface</span> ever built.
          Posts, Reels, Stories, IGTV - everything at your fingertips.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button 
            size="lg" 
            onClick={scrollToMagicInput}
            className="bg-instagram-gradient hover:bg-instagram-hover text-white px-8 py-6 text-lg rounded-full transition-all duration-300 transform hover:scale-105 shadow-xl hover:shadow-2xl"
            data-testid="button-start-download"
          >
            <Download className="w-5 h-5 mr-2" />
            Start Downloading
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          
          <Button 
            size="lg" 
            variant="outline" 
            className="px-8 py-6 text-lg rounded-full backdrop-blur-sm bg-background/20 border-white/30 hover:bg-background/30 transition-all duration-300"
            data-testid="button-learn-more"
          >
            Learn More
          </Button>
        </div>
        
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl mx-auto">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">10M+</div>
            <div className="text-sm text-muted-foreground">Downloads</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">4.9★</div>
            <div className="text-sm text-muted-foreground">Rating</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary mb-2">2sec</div>
            <div className="text-sm text-muted-foreground">Avg Speed</div>
          </div>
        </div>
      </div>
    </section>
  );
}