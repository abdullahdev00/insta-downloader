import ContentTypeSelector from '../ContentTypeSelector';

export default function ContentTypeSelectorExample() {
  const handleSelect = (type: string) => {
    console.log('Selected content type:', type);
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <ContentTypeSelector onSelect={handleSelect} />
    </div>
  );
}