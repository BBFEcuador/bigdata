import type { LucideIcon } from 'lucide-react'
import { Database } from 'lucide-react'
import { Badge } from './ui/badge'

type PageHeaderProps = {
  kicker: string
  title: string
  description: string
  source?: string
  sourceDetail?: string
  icon?: LucideIcon
}

export default function PageHeader({
  kicker,
  title,
  description,
  source = 'Fuente pública',
  sourceDetail,
  icon: Icon = Database,
}: PageHeaderProps) {
  return (
    <header className="directory-page-heading">
      <div>
        <p className="directory-heading-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="directory-heading-description">{description}</p>
      </div>
      <div className="directory-heading-source">
        <Badge variant="outline"><Icon /> {source}</Badge>
        {sourceDetail && <span>{sourceDetail}</span>}
      </div>
    </header>
  )
}
