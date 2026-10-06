import { Select } from '../../ui'
import { type FlowAction, type FlowStep, actionName, newAction, newButtons, newConditions, newEnd } from '../../../../shared/pocChatFlow.ts'

/**
 * "start": the Start point (Condition or End Flow). "next": an empty slot after a condition, an Else, a button or an
 * action. "insert": between two nodes — only nodes the rest of the path can continue after.
 */
export type StepSlot = 'start' | 'next' | 'insert'

const ACTION_TYPES: FlowAction['type'][] = ['addLabel', 'addCollaborator', 'sendMessage', 'webhook', 'jump']

const CHOICES: Record<StepSlot, { value: string; label: string; make: () => FlowStep }[]> = {
  start: [
    { value: 'conditions', label: 'Add Condition', make: newConditions },
    { value: 'end-human', label: 'End Flow — Human Agent', make: () => newEnd('human') },
    { value: 'end-ai', label: 'End Flow — AI Agent', make: () => newEnd('ai') },
  ],
  next: [
    ...ACTION_TYPES.map((type) => ({ value: `action-${type}`, label: `Action — ${actionName(type)}`, make: () => newAction(type) })),
    { value: 'buttons', label: 'Message with Buttons', make: newButtons },
    { value: 'end-human', label: 'End Flow — Human Agent', make: () => newEnd('human') },
    { value: 'end-ai', label: 'End Flow — AI Agent', make: () => newEnd('ai') },
  ],
  insert: [
    ...ACTION_TYPES.filter((type) => type !== 'jump').map((type) => ({ value: `action-${type}`, label: `Action — ${actionName(type)}`, make: () => newAction(type) })),
    { value: 'buttons', label: 'Message with Buttons (rest goes under its Else)', make: newButtons },
  ],
}

/** The "+" under an open path: offers only the nodes Cekat allows in that slot. */
export function AddStepMenu({ slot, onAdd }: { slot: StepSlot; onAdd: (step: FlowStep) => void }) {
  const isInsert = slot === 'insert'
  return (
    <Select
      aria-label={isInsert ? 'Insert node' : 'Add node'}
      value=""
      className="max-w-64 border-dashed text-muted"
      onChange={(e) => {
        const choice = CHOICES[slot].find((c) => c.value === e.target.value)
        if (choice) onAdd(choice.make())
      }}
    >
      <option value="">{isInsert ? '+ Insert node here…' : '+ Add node…'}</option>
      {CHOICES[slot].map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </Select>
  )
}
