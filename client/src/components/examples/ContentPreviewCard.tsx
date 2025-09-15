import ContentPreviewCard from '../ContentPreviewCard';

export default function ContentPreviewCardExample() {
  // todo: remove mock functionality
  const mockPosts = [
    {
      type: 'post' as const,
      thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop',
      username: 'travel_vibes',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=face',
      likes: 15420,
      comments: 234,
      caption: 'Amazing sunset at the beach! Can\'t believe how beautiful this place is ✨',
      mediaCount: 3
    },
    {
      type: 'reel' as const,
      thumbnail: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=400&h=600&fit=crop',
      username: 'chef_maria',
      avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face',
      likes: 89340,
      comments: 1205,
      views: 256780,
      duration: '0:45',
      caption: 'Quick pasta recipe that will blow your mind! 🍝'
    },
    {
      type: 'story' as const,
      thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=600&fit=crop',
      username: 'john_doe',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
      likes: 0,
      comments: 0,
      views: 1234
    },
    {
      type: 'igtv' as const,
      thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=300&fit=crop',
      username: 'fitness_guru',
      avatar: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=100&h=100&fit=crop&crop=face',
      likes: 45200,
      comments: 890,
      views: 123450,
      duration: '12:34',
      caption: 'Complete workout routine for beginners - follow along!'
    }
  ];

  const handleDownload = () => {
    console.log('Download completed!');
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-8">Content Preview Cards</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {mockPosts.map((post, index) => (
            <ContentPreviewCard 
              key={index}
              {...post}
              onDownload={handleDownload}
            />
          ))}
        </div>
      </div>
    </div>
  );
}