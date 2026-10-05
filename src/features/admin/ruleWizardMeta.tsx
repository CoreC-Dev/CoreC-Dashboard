/**
 * Static metadata for RuleWizard — action definitions and match DSL
 * quick-fill templates. Extracted to keep RuleWizard.tsx under the
 * 500-line size gate.
 */
import { ArrowRight, GitBranch, Plus, Trash2, Zap } from 'lucide-react'
import type React from 'react'
import type { RuleAction } from '@/types/config'

export interface ActionMeta {
  action: RuleAction
  labelKey: string
  icon: React.ReactNode
  descKey: string
  needsTarget: 'single' | 'multi' | 'none' | 'transform'
}

export const ACTION_META: ActionMeta[] = [
  {
    action: 'forward',
    labelKey: 'ruleWizard.actionForward',
    icon: <ArrowRight className="h-4 w-4" />,
    descKey: 'ruleWizard.actionForwardDesc',
    needsTarget: 'single',
  },
  {
    action: 'drop',
    labelKey: 'ruleWizard.actionDrop',
    icon: <Trash2 className="h-4 w-4" />,
    descKey: 'ruleWizard.actionDropDesc',
    needsTarget: 'none',
  },
  {
    action: 'alert',
    labelKey: 'ruleWizard.actionAlert',
    icon: <Zap className="h-4 w-4" />,
    descKey: 'ruleWizard.actionAlertDesc',
    needsTarget: 'none',
  },
  {
    action: 'transform',
    labelKey: 'ruleWizard.actionTransform',
    icon: <GitBranch className="h-4 w-4" />,
    descKey: 'ruleWizard.actionTransformDesc',
    needsTarget: 'transform',
  },
  {
    action: 'mirror',
    labelKey: 'ruleWizard.actionMirror',
    icon: <Plus className="h-4 w-4" />,
    descKey: 'ruleWizard.actionMirrorDesc',
    needsTarget: 'multi',
  },
]

export const MATCH_TEMPLATES: { label: string; value: string }[] = [
  { label: 'ALL', value: 'ALL' },
  { label: 'driver == "plc-modbus"', value: 'driver == "plc-modbus"' },
  { label: 'tag contains "temp"', value: 'tag contains "temp"' },
  { label: 'value > 90', value: 'value > 90' },
  { label: 'quality == "good"', value: 'quality == "good"' },
  { label: 'driver == "x" && value > 50', value: 'driver == "x" && value > 50' },
]
