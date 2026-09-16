import { useState } from 'react'
import type { ActionOption, PhaseUI } from './types'

export interface GamePhaseViewProps {
  view: PhaseUI
  sendCommand: (type: string, payload?: Record<string, unknown>) => void
  connected: boolean
}

function SelectionPanel({ action, disabled, onSubmit }: { action: ActionOption; disabled: boolean; onSubmit: (values: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (value: string) => setSelected((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  return <div className="space-y-2"><p className="text-sm text-gray-400">{action.label}</p><div className={action.layout === 'grid-5' ? 'grid grid-cols-5 gap-2' : 'grid grid-cols-2 gap-2'}>{action.options?.map((option) => <button key={option.value} disabled={disabled || action.disabled} onClick={() => toggle(option.value)} className={`rounded-lg py-3 px-4 text-sm font-medium min-h-[44px] disabled:opacity-50 ${selected.includes(option.value) ? 'bg-indigo-600' : 'bg-gray-700'}`}>{option.label}</button>)}</div><button disabled={disabled || selected.length === 0} onClick={() => onSubmit(selected)} className="w-full bg-green-600 disabled:opacity-50 rounded-lg py-3 min-h-[44px]">确认</button></div>
}

function TextAction({ action, disabled, onSubmit }: { action: ActionOption; disabled: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState('')
  return <div className="space-y-2"><p className="text-sm text-gray-400">{action.label}</p><input value={text} onChange={(event) => setText(event.target.value)} placeholder={action.input?.placeholder} maxLength={action.input?.maxLength} disabled={disabled || action.disabled} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 min-h-[44px]" /><button disabled={disabled || action.disabled || !text.trim()} onClick={() => onSubmit(text.trim())} className="w-full bg-green-600 disabled:opacity-50 rounded-lg py-3 min-h-[44px]">提交</button></div>
}

export function GamePhaseView({ view, sendCommand, connected }: GamePhaseViewProps) {
  const disabled = !connected
  return <div className="flex flex-col items-center gap-4 p-4 pt-10"><h2 className="text-xl font-bold">{view.title}</h2>{view.description && <p className="text-gray-300 text-center">{view.description}</p>}{Object.keys(view.publicData).length > 0 && <div className="w-full max-w-sm bg-gray-800 rounded-lg p-4 space-y-2">{Object.entries(view.publicData).map(([key, value]) => <div key={key} className="text-sm"><span className="text-gray-400">{key}:</span>{' '}<span className="whitespace-pre-line">{String(value)}</span></div>)}</div>}{Object.keys(view.privateData).length > 0 && <div className="w-full max-w-sm bg-indigo-900/50 border border-indigo-500/30 rounded-lg p-4 space-y-2"><div className="text-xs text-indigo-300 font-semibold">🔒 仅你可见</div>{Object.entries(view.privateData).map(([key, value]) => <div key={key} className="text-sm"><span className="text-indigo-300">{key}:</span>{' '}<span>{String(value)}</span></div>)}</div>}<div className="w-full max-w-sm space-y-3 mt-4">{view.availableActions.map((action) => action.options ? <SelectionPanel key={action.type} action={action} disabled={disabled} onSubmit={(values) => sendCommand(action.type, action.type === 'nominate' ? { members: values } : { value: values[0] })} /> : action.input ? <TextAction key={action.type} action={action} disabled={disabled} onSubmit={(text) => sendCommand(action.type, { text })} /> : <button key={action.type} disabled={disabled || action.disabled} onClick={() => sendCommand(action.type)} className="w-full bg-indigo-600 disabled:opacity-50 rounded-lg py-3 min-h-[44px]">{action.label}</button>)}</div></div>
}
