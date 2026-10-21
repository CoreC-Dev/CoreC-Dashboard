// Driver type metadata for the wizard's type picker (icon, label,
// description per protocol). Extracted from DriverWizard (D2, quality
// audit 2026-10-21) — data identical.

import { FileText, Settings2, Zap } from 'lucide-react'
import type React from 'react'
import type { DriverType } from '@/types/config'

export interface DriverTypeMeta {
  type: DriverType
  label: string
  icon: React.ReactNode
  description: string
}

export const DRIVER_TYPE_META: DriverTypeMeta[] = [
  {
    type: 'modbus-tcp',
    label: 'Modbus TCP',
    icon: <Zap className="h-5 w-5" />,
    description: 'PLC / sensor gateway over Ethernet',
  },
  {
    type: 'modbus-rtu',
    label: 'Modbus RTU',
    icon: <Zap className="h-5 w-5" />,
    description: 'Serial line (RS-485) sensor',
  },
  {
    type: 'modbus-rtuovertcp',
    label: 'Modbus RTU over TCP',
    icon: <Zap className="h-5 w-5" />,
    description: 'Serial-to-Ethernet gateway',
  },
  {
    type: 'modbus-udp',
    label: 'Modbus UDP',
    icon: <Zap className="h-5 w-5" />,
    description: 'Modbus TCP over UDP',
  },
  {
    type: 'modbus-rtuoverudp',
    label: 'Modbus RTU over UDP',
    icon: <Zap className="h-5 w-5" />,
    description: 'RTU framing over UDP',
  },
  {
    type: 'modbus-tls',
    label: 'Modbus TLS',
    icon: <Zap className="h-5 w-5" />,
    description: 'Encrypted Modbus (mTLS)',
  },
  {
    type: 's7',
    label: 'Siemens S7',
    icon: <Settings2 className="h-5 w-5" />,
    description: 'S7-300 / S7-1200 / S7-1500',
  },
  {
    type: 'opcua',
    label: 'OPC UA',
    icon: <FileText className="h-5 w-5" />,
    description: 'SCADA / MES OPC server',
  },
]
