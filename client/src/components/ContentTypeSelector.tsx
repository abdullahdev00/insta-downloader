import { useState } from 'react';
import { Image, Video, PlayCircle, Film, Bookmark, Grid3X3 } from 'lucide-react';

interface ContentType {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  gradient: string;
}

const contentTypes: ContentType[] = [
  {
    id: 'posts',
    name: 'Posts',
    icon: <Image className="w-8 h-8" />,
    description: 'Single photos & carousels',
    gradient: 'from-purple-500 to-pink-500'
  },
  {
    id: 'reels',
    name: 'Reels',
    icon: <PlayCircle className="w-8 h-8" />,
    description: 'Short vertical videos',
    gradient: 'from-orange-500 to-red-500'
  },
  {
    id: 'stories',
    name: 'Stories',
    icon: <Video className="w-8 h-8" />,
    description: '24-hour content',
    gradient: 'from-pink-500 to-purple-500'
  },
  {
    id: 'igtv',
    name: 'IGTV',
    icon: <Film className="w-8 h-8" />,
    description: 'Long-form videos',
    gradient: 'from-blue-500 to-cyan-500'
  },
];

interface ContentTypeSelectorProps {
  onSelect?: (type: string) => void;
}

export default function ContentTypeSelector({ onSelect }: ContentTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<string>('posts');

  const handleSelect = (typeId: string) => {
    setSelectedType(typeId);
    onSelect?.(typeId);
    console.log('Content type selected:', typeId);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold mb-4">
          Choose Your <span className="bg-instagram-gradient bg-clip-text text-transparent">Content Type</span>
        </h2>
        <p className="text-xl text-muted-foreground">
          Select what you want to download from Instagram
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {contentTypes.map((type) => (
          <div
            key={type.id}
            onClick={() => handleSelect(type.id)}
            className={`
              relative group cursor-pointer aspect-square rounded-3xl overflow-hidden
              transition-all duration-500 transform hover:scale-105 hover:-translate-y-2
              ${selectedType === type.id ? 'scale-105 -translate-y-2' : ''}
            `}
            data-testid={`card-content-type-${type.id}`}
          >
            {/* Background */}
            <div className={`
              absolute inset-0 bg-gradient-to-br ${type.gradient} opacity-20
              group-hover:opacity-30 transition-opacity duration-300
            `} />
            
            {/* Glassmorphism overlay */}
            <div className="absolute inset-0 bg-background/10 backdrop-blur-xl border border-white/20" />
            
            {/* Rotating border effect */}
            <div className="absolute -inset-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className={`
                absolute inset-0 bg-gradient-to-r ${type.gradient} rounded-3xl animate-rotate blur-sm
              `} style={{ animationDuration: '3s' }} />
            </div>
            
            {/* Content */}
            <div className="relative z-10 h-full flex flex-col items-center justify-center p-6 text-center">
              <div className={`
                mb-4 p-4 rounded-2xl bg-gradient-to-br ${type.gradient} 
                shadow-lg transform transition-transform duration-300
                ${selectedType === type.id ? 'scale-110' : 'group-hover:scale-110'}
              `}>
                <div className="text-white">
                  {type.icon}
                </div>
              </div>
              
              <h3 className="text-lg font-bold mb-2 text-foreground">
                {type.name}
              </h3>
              
              <p className="text-sm text-muted-foreground leading-tight">
                {type.description}
              </p>
              
              {/* Selection indicator */}
              {selectedType === type.id && (
                <div className="absolute top-3 right-3">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}