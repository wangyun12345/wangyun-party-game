import type { GameViewProps } from '../definition'
import { GamePhaseView } from '../GamePhaseView'

export function GooseDuckView({ view, sendCommand, connected }: GameViewProps) {
  return <GamePhaseView view={view} connected={connected} sendCommand={(type, payload) => { void sendCommand({ playerId: '', type, payload }) }} />
}
