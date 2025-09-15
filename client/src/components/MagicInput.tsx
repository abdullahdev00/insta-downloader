import { useState } from 'react';
import { Search, Download, Loader2, Check, Clipboard, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

interface MagicInputProps {
  onDownload?: (metadata: any) => void;
}

export default function MagicInput({ onDownload }: MagicInputProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const { toast } = useToast();

  const validateInstagramUrl = (url: string) => {
    const patterns = [
      /^https?:\/\/(www\.)?instagram\.com\/p\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/reel\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/stories\/[\w.-]+\/[\w-]+/,
      /^https?:\/\/(www\.)?instagram\.com\/tv\/[\w-]+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const detectContentType = (url: string): string => {
    if (url.includes('/reel/')) return 'reel';
    if (url.includes('/stories/')) return 'story';
    if (url.includes('/tv/')) return 'igtv';
    if (url.includes('/p/')) return 'post';
    return 'post';
  };

  const handleInputChange = (value: string) => {
    setUrl(value);
    setIsValid(validateInstagramUrl(value));
  };

  const handleClipboardPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleInputChange(text);
        toast({
          title: "URL Pasted! 📋",
          description: "URL has been pasted from clipboard",
        });
      }
    } catch (error) {
      toast({
        title: "Clipboard Error",
        description: "Please paste the URL manually or check clipboard permissions",
        variant: "destructive"
      });
    }
  };

  const handleClearInput = () => {
    setUrl('');
    setIsValid(false);
  };

  const handleDownload = async () => {
    if (!isValid) return;
    
    setIsLoading(true);
    
    try {
      // First get preview/metadata
      const previewResponse = await fetch('/api/instagram/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!previewResponse.ok) {
        throw new Error('Failed to fetch content preview');
      }

      const metadata = await previewResponse.json();
      
      // Start download process
      const downloadResponse = await fetch('/api/instagram/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url, 
          type: detectContentType(url) 
        })
      });

      if (!downloadResponse.ok) {
        throw new Error('Failed to start download');
      }

      const { downloadId } = await downloadResponse.json();
      
      toast({
        title: "Download Started! ✨",
        description: `Processing ${metadata.type} from @${metadata.username}`,
      });

      // Pass metadata with download ID to parent
      onDownload?.({ ...metadata, downloadId });
      
      // Clear form
      setUrl('');
      setIsValid(false);
      
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Download Failed",
        description: "Please check the URL and try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="relative group">
        {/* Background glow effect */}
        <div className="absolute -inset-1 bg-instagram-gradient rounded-full blur-lg opacity-30 group-hover:opacity-50 transition-opacity duration-300" />
        
        <div className="relative bg-background/20 backdrop-blur-xl border border-white/20 rounded-full p-2 shadow-2xl">
          <div className="flex items-center gap-2">
            {/* Icon - Search when empty, X to clear when filled */}
            <div className="flex-shrink-0 ml-4">
              <div className="relative">
                <div 
                  className={`w-12 h-12 bg-instagram-gradient rounded-full flex items-center justify-center ${url ? 'cursor-pointer hover:scale-110' : ''} transition-transform duration-200`}
                  onClick={url ? handleClearInput : undefined}
                  data-testid={url ? "button-clear" : "icon-search"}
                >
                  {url ? (
                    <X className="w-6 h-6 text-white" />
                  ) : (
                    <Search className="w-6 h-6 text-white" />
                  )}
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
            
            {/* Clipboard Button - Shows only on small screens when input is empty */}
            {!url && (
              <Button
                onClick={handleClipboardPaste}
                size="lg"
                className="mr-2 h-14 px-4 sm:hidden bg-primary/20 hover:bg-primary/30 border border-primary/30 backdrop-blur-xl text-primary rounded-full font-semibold transition-all duration-300 transform hover:scale-105"
                data-testid="button-clipboard"
              >
                <Clipboard className="w-5 h-5" />
              </Button>
            )}

            {/* Download Button - Responsive: icon only on small screens */}
            <Button
              onClick={handleDownload}
              disabled={!isValid || isLoading}
              size="lg"
              className="mr-2 h-14 sm:px-8 px-4 bg-instagram-gradient hover:bg-instagram-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-white font-semibold transition-all duration-300 transform hover:scale-105"
              data-testid="button-download"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Processing...</span>
                </>
              ) : isValid && !isLoading ? (
                <>
                  <Check className="w-5 h-5 sm:mr-2" />
                  <span className="hidden sm:inline">Download</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 sm:mr-2" />
                  <span className="hidden sm:inline">Download</span>
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