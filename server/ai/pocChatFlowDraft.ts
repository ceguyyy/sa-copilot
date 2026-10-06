// "Generate with AI" for the POC Flow tab: the Cekat Flow builder rules, and the flat node schema the model fills.
// shared/pocChatFlowAi.ts turns the result into the stored tree.
import { CHAT_FLOW_LIMITS, WEEK_DAYS } from '../../shared/pocChatFlow.ts'
import { arr, obj, str } from './structured.ts'

const oneOf = (values: readonly string[], description?: string) => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) })
const refs = (description: string) => arr(str(), description)

const flowNode = obj({
  ref: str('Unique short id of this node within the flow, e.g. "c-hours", "m-menu", "e-cs"'),
  kind: oneOf(['condition', 'action', 'buttons', 'end']),
  conditionType: oneOf(['firstMessageText', 'firstMessageTime', ''], 'condition only; "" otherwise'),
  text: str('firstMessageText: the exact, case-sensitive first message that triggers this path, e.g. "PROMO"; "" otherwise'),
  from: str('firstMessageTime: start time HH:MM; "" otherwise'),
  to: str('firstMessageTime: end time HH:MM; "" otherwise'),
  days: arr(oneOf(WEEK_DAYS), 'firstMessageTime: days it applies; empty otherwise'),
  actionType: oneOf(['addLabel', 'addCollaborator', 'sendMessage', 'webhook', 'jump', ''], 'action only; "" otherwise'),
  value: str('action: the label name, collaborator (agent or team), message text, or webhook https URL; "" for jump'),
  jumpTo: str('jump action: ref of the node to continue at; "" otherwise'),
  message: str(`buttons: message text (max ${CHAT_FLOW_LIMITS.message} chars); "" otherwise`),
  buttons: arr(obj({ label: str(`Button text, max ${CHAT_FLOW_LIMITS.buttonChars} characters`), nextRef: str('ref of the node after this button') }), `buttons: 1-${CHAT_FLOW_LIMITS.buttons} buttons; empty otherwise`),
  elseRef: str('buttons: ref of the node when the customer types anything else; "" otherwise'),
  endType: oneOf(['human', 'ai', ''], 'end only; "" otherwise'),
  agents: arr(str(), 'end human: human agent or team names; empty otherwise'),
  aiAgent: str('end ai: name of the Cekat AI agent that takes over; "" otherwise'),
  nextRef: str('condition or action (not jump): ref of the next node; "" otherwise'),
})

export const chatFlowSchema = obj({
  flows: arr(
    obj({
      name: str('Flow name, e.g. "Inbound WhatsApp"'),
      start: obj({
        conditionRefs: refs('refs of the condition nodes directly under the Start point, in order; empty when the flow goes straight to an End'),
        elseRef: str('ref of the node for the automatic Else of those conditions'),
        endRef: str('ref of an end node when the Start point goes straight to an End; "" otherwise'),
      }),
      nodes: arr(flowNode, 'Every node of the flow, each with a unique ref'),
    }),
    `1-3 flows (max ${CHAT_FLOW_LIMITS.flows})`,
  ),
})

export const CHAT_FLOW_TASK = [
  '# CEKAT FLOW BUILDER RULES (POC Flow)',
  'A Flow is rule-based, not AI. It runs when a chat comes in from a channel, before an agent takes over. A Flow can hand the chat to an AI agent, but an AI agent can never hand back to a Flow — so do in the Flow only what needs no AI (routing, menus, labels, notices) and end at an AI agent for anything that needs it (e.g. calling an API with customer data such as tracking an order number).',
  'Start point: either condition nodes (conditionRefs) plus their automatic Else (elseRef), or directly one End (endRef). Condition nodes exist ONLY under the Start point.',
  'Conditions: firstMessageText matches the customer\'s first message EXACTLY and case-sensitively (use it for keywords from ads or QR codes, e.g. "PROMO"); firstMessageTime is a time range HH:MM–HH:MM on chosen days (use it for business hours). Every set of conditions gets an Else for everything else.',
  'After a condition, an Else, a button or a non-jump action comes one node: an action, a message with buttons, or an end.',
  'Actions (can be chained: action → action → end): addLabel (put the chat in a label, use the POC labels), addCollaborator (add an agent or team), sendMessage (send a text to the customer), webhook (POST to a URL, no variables can be added), jump (continue at another node, ends this path).',
  `Message with buttons: a message (max ${CHAT_FLOW_LIMITS.message} characters) with 1-${CHAT_FLOW_LIMITS.buttons} buttons of max ${CHAT_FLOW_LIMITS.buttonChars} characters each — keep button text short. Each button is its own path, plus an Else path when the customer types something else.`,
  'End: human (list the human agents or team) or ai (name the AI agent). EVERY path, including every Else, must end in an End node or a jump — the Flow cannot be saved in Cekat otherwise.',
  'To reuse a node (e.g. the same "handoff to CS" end), reference its ref from several places; it is placed once and the others jump to it.',
  'Design 1-3 flows that fit this POC: e.g. business hours vs. after hours, a main menu with buttons that routes to the right AI agent or human team, keyword campaigns. Use the POC labels, handoff conditions and agent names where they fit.',
].join('\n')
