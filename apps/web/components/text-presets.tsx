"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Mic2, BookOpen, MessageSquare, Megaphone, Heart } from 'lucide-react'

interface TextPresetsProps {
  onSelect: (text: string) => void
}

const PRESETS = [
  {
    category: 'Demo',
    icon: Sparkles,
    items: [
      "Hello! Welcome to NextEleven, the most advanced voice synthesis platform. Our technology creates incredibly natural speech that's indistinguishable from human voices.",
      "The quick brown fox jumps over the lazy dog. This sentence contains every letter of the English alphabet.",
    ]
  },
  {
    category: 'Narration',
    icon: BookOpen,
    items: [
      "In a world where technology and humanity converge, one voice stood apart from the rest. It spoke with warmth, clarity, and an unmistakable sense of authenticity.",
      "Chapter One: The Beginning. It was a dark and stormy night when everything changed. Little did anyone know that the events of this evening would alter the course of history forever.",
    ]
  },
  {
    category: 'Podcast',
    icon: Mic2,
    items: [
      "Hey everyone! Welcome back to another episode. Today we're diving deep into a topic that I know you've all been asking about. Let's get right into it.",
      "Before we continue, a quick word from our sponsor. Have you ever wanted to create professional voiceovers in seconds? Well, now you can with NextEleven!",
    ]
  },
  {
    category: 'Marketing',
    icon: Megaphone,
    items: [
      "Introducing the future of voice technology. With NextEleven, create stunning voiceovers in seconds, not hours. Try it free today!",
      "Are you tired of robotic-sounding text-to-speech? Experience the difference with our premium AI voices. Natural. Emotional. Human.",
    ]
  },
  {
    category: 'Conversation',
    icon: MessageSquare,
    items: [
      "Hey, how's it going? I was just thinking about you. Did you see that message I sent earlier?",
      "Oh wow, that's really interesting! I never thought about it that way. Tell me more about your perspective on this.",
    ]
  },
  {
    category: 'Emotional',
    icon: Heart,
    items: [
      "I want you to know how much you mean to me. Every moment we spend together is a treasure I hold close to my heart.",
      "This is devastating news. I... I don't know what to say. Everything we worked for, everything we believed in... it's all gone.",
    ]
  },
]

export const TextPresets = React.memo(function TextPresets({ onSelect }: TextPresetsProps) {
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        Quick Presets
      </h4>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <div key={preset.category} className="relative group">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <preset.icon className="w-3 h-3" />
              {preset.category}
            </Button>
            
            {/* Dropdown */}
            <div className="absolute z-50 top-full left-0 mt-1 w-80 bg-popover border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
              <div className="p-2 space-y-1">
                {preset.items.map((text, i) => (
                  <button
                    key={i}
                    onClick={() => onSelect(text)}
                    className="w-full p-2 text-left text-sm rounded-md hover:bg-accent transition-colors"
                  >
                    <span className="line-clamp-2">{text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
