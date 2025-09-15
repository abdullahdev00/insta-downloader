import { useState } from 'react';
import { Heart, MessageCircle, Send, Bookmark, Download, Eye, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ContentPreviewCardProps {
  type: 'post' | 'reel' | 'story' | 'igtv';
  thumbnail: string;
  username: string;
  avatar: string;
  likes: number;
  comments: number;
  views?: number;
  duration?: string;
  caption?: string;
  mediaCount?: number;
  status?: 'processing' | 'completed' | 'failed' | 'pending';
  onDownload?: () => void;
}

export default function ContentPreviewCard({
  type,
  thumbnail,
  username,
  avatar,
  likes,
  comments,
  views,
  duration,
  caption,
  mediaCount,
  status = 'completed',
  onDownload
}: ContentPreviewCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (status !== 'completed') return;
    
    setIsDownloading(true);
    console.log(`Downloading ${type} from ${username}`);
    
    // Trigger actual download immediately
    onDownload?.();
    
    setIsDownloading(false);
  };

  const getStatusButton = () => {
    if (status === 'processing') {
      return {
        text: 'Processing...',
        icon: <Loader2 className="w-5 h-5 mr-2 animate-spin" />,
        disabled: true,
        className: 'bg-yellow-500 hover:bg-yellow-600 cursor-not-allowed'
      };
    }
    if (status === 'failed') {
      return {
        text: 'Failed',
        icon: <AlertCircle className="w-5 h-5 mr-2" />,
        disabled: true,
        className: 'bg-red-500 hover:bg-red-600 cursor-not-allowed'
      };
    }
    if (status === 'pending') {
      return {
        text: 'Pending',
        icon: <Clock className="w-5 h-5 mr-2" />,
        disabled: true,
        className: 'bg-gray-500 hover:bg-gray-600 cursor-not-allowed'
      };
    }
    // completed status
    if (isDownloading) {
      return {
        text: 'Downloading...',
        icon: <div className="w-5 h-5 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />,
        disabled: true,
        className: 'bg-instagram-gradient hover:bg-instagram-hover'
      };
    }
    return {
      text: 'Download',
      icon: <Download className="w-5 h-5 mr-2" />,
      disabled: false,
      className: 'bg-instagram-gradient hover:bg-instagram-hover'
    };
  };

  const buttonConfig = getStatusButton();

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getTypeConfig = () => {
    switch (type) {
      case 'reel':
        return {
          aspectRatio: 'aspect-[9/16]',
          badge: 'Reel',
          badgeColor: 'bg-orange-500',
          icon: <Eye className="w-4 h-4" />
        };
      case 'story':
        return {
          aspectRatio: 'aspect-[9/16]',
          badge: 'Story',
          badgeColor: 'bg-purple-500',
          icon: <Clock className="w-4 h-4" />
        };
      case 'igtv':
        return {
          aspectRatio: 'aspect-video',
          badge: 'IGTV',
          badgeColor: 'bg-blue-500',
          icon: <Eye className="w-4 h-4" />
        };
      default:
        return {
          aspectRatio: 'aspect-square',
          badge: 'Post',
          badgeColor: 'bg-pink-500',
          icon: <Heart className="w-4 h-4" />
        };
    }
  };

  const config = getTypeConfig();

  return (
    <div 
      className="group relative bg-card rounded-lg overflow-hidden border border-card-border shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={`card-preview-${type}-${username}`}
    >
      {/* Content Type Badge */}
      <div className="absolute top-4 left-4 z-20">
        <Badge className={`${config.badgeColor} text-white border-0 px-2 py-1 text-xs font-medium`}>
          {config.badge}
        </Badge>
      </div>

      {/* Media Count Badge (for carousels) */}
      {mediaCount && mediaCount > 1 && (
        <div className="absolute top-4 right-4 z-20">
          <div className="bg-black/70 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
            </svg>
            {mediaCount}
          </div>
        </div>
      )}

      {/* Story Ring removed - was causing rectangular box animation issue */}

      {/* Thumbnail */}
      <div className={`relative ${config.aspectRatio} overflow-hidden`}>
        <img 
          src={thumbnail} 
          alt={`${type} by ${username}`}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        
        {/* Duration overlay for videos */}
        {duration && (
          <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-1 rounded-md">
            {duration}
          </div>
        )}

        {/* Hover overlay */}
        <div className={`
          absolute inset-0 bg-black/40 transition-opacity duration-300
          ${isHovered ? 'opacity-100' : 'opacity-0'}
        `}>
          <div className="absolute inset-0 flex items-center justify-center">
            <Button
              onClick={handleDownload}
              disabled={buttonConfig.disabled}
              size="lg"
              className={`${buttonConfig.className} text-white rounded-full px-6 py-3 transform transition-all duration-300 hover:scale-110`}
              data-testid={`button-download-${username}`}
            >
              {buttonConfig.icon}
              {buttonConfig.text}
            </Button>
          </div>
        </div>
      </div>

      {/* Content Footer */}
      <div className="p-3">
        {/* User Info */}
        <div className="flex items-center gap-2 mb-2">
          <img 
            src={avatar} 
            alt={username}
            className="w-6 h-6 rounded-full border border-primary/20"
          />
          <span className="font-medium text-xs text-foreground">{username}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 text-muted-foreground text-xs">
          <div className="flex items-center gap-1">
            <Heart className="w-3 h-3 text-red-500" />
            <span>{formatNumber(likes)}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="w-3 h-3" />
            <span>{formatNumber(comments)}</span>
          </div>
          {views && (
            <div className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              <span>{formatNumber(views)}</span>
            </div>
          )}
        </div>

        {/* Caption */}
        {caption && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
            {caption}
          </p>
        )}
      </div>
    </div>
  );
}