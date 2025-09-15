import { useState } from 'react';
import { Search, Download, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MagicInputProps {
  onDownload?: (url: string) => void;
}

export default function MagicInput({ onDownload }: MagicInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(false);

  const validateInstagramUrl = (url: string) => {
    const patterns = [
      /^https?:\/\/(www\.)?instagram\.com\/p\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/reel\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/stories\/[\w.-]+\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/tv\/[\w-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const handleInputChange = (value: string) => {
    setUrl(value);
    setIsValid(validateInstagramUrl(value));
  };

  const handleDownload = async () => {
    if (!isValid) return;
    
    setIsLoading(true);
    console.log('Download triggered for:', url);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsLoading(false);
    onDownload?.(url);
    
    // Show success briefly
    setTimeout(() => {
      setUrl('');
      setIsValid(false);
    }, 1000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="relative group">
        {/* Background glow effect */}
        <div className="absolute -inset-1 bg-instagram-gradient rounded-full blur-lg opacity-30 group-hover:opacity-50 transition-opacity duration-300" />
        
        <div className="relative bg-background/20 backdrop-blur-xl border border-white/20 rounded-full p-2 shadow-2xl">
          <div className="flex items-center gap-2">
            {/* Icon */}
            <div className="flex-shrink-0 ml-4">
              <div className="relative">
                <div className="w-12 h-12 bg-instagram-gradient rounded-full flex items-center justify-center animate-pulse-glow">
                  <Search className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
            
            {/* Input */}
            <Input
              type="url"
              placeholder="Paste Instagram URL here... (posts, reels, stories, IGTV)"
              value={url}
              onChange={(e) => handleInputChange(e.target.value)}
              className="flex-1 border-0 bg-transparent text-lg placeholder:text-muted-foreground/60 focus-visible:ring-0 h-16 px-4"
              data-testid="input-instagram-url"
            />
            
            {/* Download Button */}
            <Button
              onClick={handleDownload}
              disabled={!isValid || isLoading}
              size="lg"
              className="mr-2 h-14 px-8 bg-instagram-gradient hover:bg-instagram-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-white font-semibold transition-all duration-300 transform hover:scale-105"
              data-testid="button-download"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : isValid && !isLoading ? (
                <>
                  <Check className="w-5 h-5 mr-2" />
                  Download
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Download
                </>
              )}
            </Button>
          </div>
        </div>
        
        {/* URL validation indicator */}
        {url && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
            <div className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
              isValid 
                ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}>
              {isValid ? '✓ Valid Instagram URL' : '✗ Invalid URL format'}
            </div>
          </div>
        )}
      </div>
      
      {/* Supported formats */}
      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground mb-3">Supported formats:</p>
        <div className="flex flex-wrap justify-center gap-3">
          {['Posts', 'Reels', 'Stories', 'IGTV', 'Carousel'].map((format) => (
            <span 
              key={format}
              className="px-3 py-1 bg-primary/10 text-primary text-xs rounded-full border border-primary/20"
            >
              {format}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}