import MagicInput from '../MagicInput';

export default function MagicInputExample() {
  const handleDownload = (url: string) => {
    console.log('Download initiated for:', url);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold mb-2">Magic Input Field</h2>
          <p className="text-muted-foreground">Paste an Instagram URL to see the magic happen</p>
        </div>
        <MagicInput onDownload={handleDownload} />
      </div>
    </div>
  );
}