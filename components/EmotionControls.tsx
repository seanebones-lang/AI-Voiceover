import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

type Emotion = 'happy' | 'sad' | 'angry' | 'excited' | 'neutral';

interface Props {
  onStyleChange: (style: { emotion: Emotion; speed: number; pitch: number }) => void;
  previewText?: string;
}

export function EmotionControls({ onStyleChange, previewText }: Props) {
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [speed, setSpeed] = useState([1.0]);
  const [pitch, setPitch] = useState([1.0]);

  const handlePreview = async () => {
    // Apply style; use POST /api/tts for preview with voice + params
    onStyleChange({ emotion, speed: speed[0], pitch: pitch[0] });
  };

  return (
    <div className="space-y-4 p-6 border rounded-xl bg-gradient-to-br from-gray-50 to-gray-100">
      <h3 className="font-bold text-lg">Voice Style</h3>
      <Select value={emotion} onValueChange={(v) => setEmotion(v as Emotion)}>
        <SelectTrigger>
          <SelectValue placeholder="Emotion" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="happy">😊 Happy</SelectItem>
          <SelectItem value="sad">😢 Sad</SelectItem>
          <SelectItem value="angry">😠 Angry</SelectItem>
          <SelectItem value="excited">🚀 Excited</SelectItem>
          <SelectItem value="neutral">😐 Neutral</SelectItem>
        </SelectContent>
      </Select>
      <div>
        <label>Speed: {speed[0].toFixed(1)}x</label>
        <Slider value={speed} onValueChange={setSpeed} min={0.5} max={2.0} step={0.1} />
      </div>
      <div>
        <label>Pitch: {pitch[0].toFixed(1)}x</label>
        <Slider value={pitch} onValueChange={setPitch} min={0.8} max={1.2} step={0.05} />
      </div>
      {previewText && (
        <Button onClick={handlePreview} className="w-full">Preview: "{previewText.slice(0, 20)}..."</Button>
      )}
    </div>
  );
}