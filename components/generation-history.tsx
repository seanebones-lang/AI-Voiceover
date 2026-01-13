"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, Download, Play, Trash2, Volume2 } from 'lucide-react'

export interface HistoryItem {
  id: string
  text: string
  voiceId: string
  voiceName: string
  audioUrl: string
  timestamp: Date
  duration?: number
  settings: {
    speed: number
    pitch: number
    volume: number
  }
}

interface GenerationHistoryProps {
  items: HistoryItem[]
  onPlay: (item: HistoryItem) => void
  onDownload: (item: HistoryItem) => void
  onDelete: (id: string) => void
  onClear: () => void
}

export function GenerationHistory({
  items,
  onPlay,
  onDownload,
  onDelete,
  onClear
}: GenerationHistoryProps) {
  const [playingId, setPlayingId] = useState<string | null>(null)

  if (items.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No generation history yet</p>
          <p className="text-xs mt-1">Generated audio will appear here</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent Generations ({items.length})
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
            Clear All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 max-h-[300px] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="group p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.text.substring(0, 50)}...</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Volume2 className="w-3 h-3" />
                  <span>{item.voiceName}</span>
                  <span>•</span>
                  <span>{formatTime(item.timestamp)}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setPlayingId(item.id)
                    onPlay(item)
                  }}
                >
                  <Play className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDownload(item)}
                >
                  <Download className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
            {playingId === item.id && (
              <audio
                src={item.audioUrl}
                controls
                autoPlay
                className="w-full mt-2 h-8"
                onEnded={() => setPlayingId(null)}
              />
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return date.toLocaleDateString()
}
