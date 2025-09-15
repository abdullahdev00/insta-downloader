import { useState, useEffect } from 'react';
import ParticleBackground from '@/components/ParticleBackground';
import FloatingHeader from '@/components/FloatingHeader';
import HeroSection from '@/components/HeroSection';
import MagicInput from '@/components/MagicInput';
import ContentTypeSelector from '@/components/ContentTypeSelector';
import ContentPreviewCard from '@/components/ContentPreviewCard';
import { useToast } from '@/hooks/use-toast';

interface DownloadedContent {
  id?: string;
  downloadId?: string;
  type: 'post' | 'reel' | 'story' | 'igtv';
  thumbnail: string;
  username: string;
  avatar?: string;
  likes?: number;
  comments?: number;
  views?: number;
  duration?: string;
  caption?: string;
  mediaCount?: number;
  status?: string;
}

export default function InstagramDownloader() {
  const [selectedContentType, setSelectedContentType] = useState<string>('posts');
  const [downloadedContent, setDownloadedContent] = useState<DownloadedContent[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const { toast } = useToast();

  // Load recent downloads on component mount
  useEffect(() => {
    loadRecentDownloads();
  }, []);

  const loadRecentDownloads = async () => {
    try {
      const response = await fetch('/api/downloads?limit=10');
      if (response.ok) {
        const downloads = await response.json();
        const formattedContent = downloads
          .filter((download: any) => download.metadata)
          .map((download: any) => ({
            id: download.id,
            downloadId: download.id,
            ...download.metadata,
            avatar: `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face`,
            status: download.status
          }));
        
        if (formattedContent.length > 0) {
          setDownloadedContent(formattedContent);
          setShowPreview(true);
        }
      }
    } catch (error) {
      console.error('Error loading recent downloads:', error);
    }
  };

  const handleDownload = (metadata: any) => {
    console.log('Processing download for:', metadata);
    
    // Add avatar if not present
    const contentWithAvatar = {
      ...metadata,
      avatar: metadata.avatar || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face`,
      status: 'processing'
    };
    
    setDownloadedContent(prev => [contentWithAvatar, ...prev]);
    setShowPreview(true);

    // Poll for download status if we have a downloadId
    if (metadata.downloadId) {
      pollDownloadStatus(metadata.downloadId);
    }
  };

  const pollDownloadStatus = async (downloadId: string) => {
    const maxAttempts = 30; // 30 seconds max
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/downloads/${downloadId}`);
        if (response.ok) {
          const download = await response.json();
          
          // Update the content in our list
          setDownloadedContent(prev => 
            prev.map(content => 
              content.downloadId === downloadId 
                ? { ...content, status: download.status }
                : content
            )
          );

          if (download.status === 'completed') {
            toast({
              title: "Download Complete! 🎉",
              description: "Your Instagram content is ready to download.",
            });
            return;
          } else if (download.status === 'failed') {
            toast({
              title: "Download Failed",
              description: "Something went wrong. Please try again.",
              variant: "destructive"
            });
            return;
          }
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000); // Poll every second
        }
      } catch (error) {
        console.error('Error polling download status:', error);
      }
    };

    poll();
  };

  const handleContentTypeSelect = (type: string) => {
    setSelectedContentType(type);
    console.log('Content type changed to:', type);
  };

  const handleFinalDownload = async (content: DownloadedContent) => {
    if (!content.downloadId) return;
    
    try {
      // Open download link in new tab
      window.open(`/api/downloads/${content.downloadId}/file`, '_blank');
      
      toast({
        title: "Download Started! 📁",
        description: "Check your downloads folder.",
      });
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: "Download Error",
        description: "Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {/* Particle Background */}
      <ParticleBackground />
      
      {/* Floating Header */}
      <FloatingHeader />
      
      {/* Main Content */}
      <main className="relative z-10">
        {/* Hero Section */}
        <HeroSection />
        
        {/* Content Type Selection */}
        <section className="py-20 px-4">
          <ContentTypeSelector onSelect={handleContentTypeSelect} />
        </section>
        
        {/* Magic Input */}
        <section className="py-20 px-4">
          <div className="max-w-6xl mx-auto text-center mb-12">
            <h2 className="text-4xl font-bold mb-4">
              Paste Your <span className="bg-instagram-gradient bg-clip-text text-transparent">Instagram URL</span>
            </h2>
            <p className="text-xl text-muted-foreground">
              Copy any Instagram URL and watch the magic happen
            </p>
          </div>
          <MagicInput onDownload={handleDownload} />
        </section>
        
        {/* Preview Section */}
        {showPreview && downloadedContent.length > 0 && (
          <section className="py-20 px-4">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-4">
                  Your <span className="bg-instagram-gradient bg-clip-text text-transparent">Downloads</span>
                </h2>
                <p className="text-xl text-muted-foreground">
                  Ready to download in highest quality
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {downloadedContent.map((content, index) => (
                  <ContentPreviewCard 
                    key={content.downloadId || index}
                    type={content.type}
                    thumbnail={content.thumbnail}
                    username={content.username}
                    avatar={content.avatar || `https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face`}
                    likes={content.likes || 0}
                    comments={content.comments || 0}
                    views={content.views}
                    duration={content.duration}
                    caption={content.caption}
                    mediaCount={content.mediaCount}
                    status={content.status as 'processing' | 'completed' | 'failed' | 'pending' || 'completed'}
                    onDownload={() => handleFinalDownload(content)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
        
        {/* Features Section */}
        <section className="py-20 px-4 bg-card/30">
          <div className="max-w-6xl mx-auto text-center">
            <h2 className="text-4xl font-bold mb-12">
              Why Choose <span className="bg-instagram-gradient bg-clip-text text-transparent">InstaDown</span>?
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-8 rounded-3xl bg-background/50 backdrop-blur-sm border border-border hover-elevate">
                <div className="w-16 h-16 mx-auto mb-6 bg-instagram-gradient rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-4">Lightning Fast</h3>
                <p className="text-muted-foreground">Download any Instagram content in under 2 seconds with our optimized processing engine.</p>
              </div>
              
              <div className="p-8 rounded-3xl bg-background/50 backdrop-blur-sm border border-border hover-elevate">
                <div className="w-16 h-16 mx-auto mb-6 bg-instagram-gradient rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-4">All Formats</h3>
                <p className="text-muted-foreground">Posts, Reels, Stories, IGTV, and Highlights - we support every Instagram content type.</p>
              </div>
              
              <div className="p-8 rounded-3xl bg-background/50 backdrop-blur-sm border border-border hover-elevate">
                <div className="w-16 h-16 mx-auto mb-6 bg-instagram-gradient rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 1L3 8l6 7 1-1L4 8l6-6 6 6-6 6 1 1 7-7-7-7z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-4">HD Quality</h3>
                <p className="text-muted-foreground">Always get the highest resolution available - no compression, no quality loss.</p>
              </div>
            </div>
          </div>
        </section>
        
        {/* Footer */}
        <footer className="py-12 px-4 border-t border-border">
          <div className="max-w-6xl mx-auto text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-8 h-8 bg-instagram-gradient rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-2xl font-bold bg-instagram-gradient bg-clip-text text-transparent">InstaDown</span>
            </div>
            <p className="text-muted-foreground mb-4">
              The most beautiful Instagram downloader ever created
            </p>
            <p className="text-sm text-muted-foreground">
              © 2024 InstaDown. Made with ❤️ for Instagram lovers.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}