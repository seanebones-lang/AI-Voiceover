export interface User {
  id: string;
  email: string;
  preferred_voices: string[];
  credits: number;
}

export interface Voice {
  id: string;
  name: string;
  embedding: number[];
  samples: { urls: string[] };
  user_id: string;
}

export interface UsageStats {
  user_id: string;
  projects_count: number;
  avg_session: number;
  total_credits: number;
}