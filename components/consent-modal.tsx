"use client"

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

interface ConsentModalProps {
  open: boolean
  onAccept: () => void
  onReject: () => void
}

export const ConsentModal = React.memo(function ConsentModal({ open, onAccept, onReject }: ConsentModalProps) {
  const [read, setRead] = useState(false)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-2xl mx-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <CardTitle>Voice Cloning Consent</CardTitle>
          </div>
          <CardDescription>
            Important ethical and legal information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 text-sm">
            <p className="font-semibold">
              Before cloning a voice, please confirm:
            </p>
            
            <ul className="list-disc list-inside space-y-2 text-muted-foreground">
              <li>
                You have explicit consent from the person whose voice you are cloning
              </li>
              <li>
                You will not use the cloned voice for fraudulent or deceptive purposes
              </li>
              <li>
                You understand that voice cloning technology can be misused
              </li>
              <li>
                You will comply with all applicable laws and regulations
              </li>
              <li>
                You take full responsibility for the use of cloned voices
              </li>
            </ul>

            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 shadow-md">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                ⚠️ Warning: Unauthorized voice cloning may violate privacy laws,
                impersonation statutes, and terms of service. Always obtain proper
                consent before cloning someone's voice.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="consent-check"
              checked={read}
              onChange={(e) => setRead(e.target.checked)}
              className="h-4 w-4 rounded-md border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2"
            />
            <label htmlFor="consent-check" className="text-sm">
              I have read and understand the above terms
            </label>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onReject}>
              Cancel
            </Button>
            <Button
              onClick={onAccept}
              disabled={!read}
              className="bg-primary"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              I Accept
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})
