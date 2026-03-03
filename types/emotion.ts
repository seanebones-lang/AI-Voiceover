export type Emotion = 'happy' | 'sad' | 'angry' | 'excited' | 'neutral';

export interface StyleOptions {
  emotion?: Emotion;
  speed?: number;
  pitch?: number;
  temperature?: number;
}