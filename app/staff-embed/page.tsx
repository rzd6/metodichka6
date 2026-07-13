import { getPool } from "@/lib/db"
import { headers } from "next/headers"

export const dynamic = "force-dynamic"
export const revalidate = 0

interface StaffMember {
  username: string
  positionTitle: string
  rank: number
}

const ANIMATED_NICKNAMES = ["Artem_Darmin"]

const LEAD_POSITIONS = [
  { title: 'Генеральный Директор ОАО "РЖД"', pt: "Главный следящий за РЖД", rank: 9 },
  { title: "Помощник Генерального Директора", pt: "Помощник Главного Следящего", rank: 9 },
  { title: "Начальник Депо", pt: "Начальник Депо", rank: 9 },
]

const SENIOR_POSITIONS = [
  { title: "Первый Заместитель Начальника Депо", pt: "Первый Заместитель Начальника Депо", rank: 8 },
  { title: "Зам. НД по кадровой работе", pt: "Заместитель Начальника Депо по кадровой работе", rank: 8 },
  { title: "Зам. НД по эксплуатации", pt: "Заместитель Начальника Депо по эксплуатации", rank: 8 },
  { title: "Начальник ЭО", pt: "Начальник ЭО", rank: 7 },
  { title: "Начальник ЦдУД", pt: "Начальник ЦдУД", rank: 7 },
  { title: "Начальник ПТО", pt: "Начальник ПТО", rank: 7 },
  { title: "Заместитель Начальника ЭО", pt: "Машинист-инструктор/Зам.Нач.ЭО", rank: 6 },
  { title: "Заместитель Начальника ЦдУД", pt: "Машинист-инструктор/Зам.Нач.ЦдУД", rank: 6 },
  { title: "Заместитель Начальника ПТО", pt: "Машинист-инструктор/Зам.Нач.ПТО", rank: 6 },
]

async function getStaff(): Promise<StaffMember[]> {
  try {
    const db = getPool()
    const res = await db.query(`
      SELECT username, position_title, rank
      FROM users
      WHERE position IN ('Руководство', 'Заместитель', 'Старший Состав', 'Тех. Администратор')
        AND position_title IS NOT NULL
      ORDER BY rank DESC, created_at ASC
    `)
    return res.rows.map((r: any) => ({
      username: r.username as string,
      positionTitle: r.position_title as string,
      rank: Number(r.rank),
    }))
  } catch {
    return []
  }
}

function buildMap(staff: StaffMember[]): Record<string, string> {
  const map: Record<string, string> = {}
  staff.forEach((s) => { map[s.positionTitle] = s.username })
  return map
}

function groupByRank<T extends { rank: number }>(positions: T[]): Record<number, T[]> {
  const groups: Record<number, T[]> = {}
  positions.forEach((p) => {
    if (!groups[p.rank]) groups[p.rank] = []
    groups[p.rank].push(p)
  })
  return groups
}

function Card({ title, username, rank }: { title: string; username: string | null; rank: number }) {
  const vacant = !username
  const animated = !vacant && ANIMATED_NICKNAMES.includes(username!)
  return (
    <div style={{
      backgroundColor: "#1a1a2e",
      borderRadius: "12px",
      padding: "18px 22px",
      width: "260px",
      border: "2px solid #cc0000",
      boxShadow: "0 4px 15px rgba(204,0,0,0.3)",
      boxSizing: "border-box" as const,
      flexShrink: 0,
    }}>
      <div style={{
        fontSize: "18px",
        fontWeight: "bold",
        color: vacant ? "rgba(255,255,255,0.3)" : "#ffffff",
        fontStyle: vacant ? "italic" : "normal",
        marginBottom: "4px",
        background: animated
          ? "linear-gradient(90deg,#ff0000,#ff1744,#ff5252,#ff8a80,#ff4081,#f50057,#ff1744,#ff0000)"
          : "none",
        backgroundSize: animated ? "300% 100%" : "auto",
        WebkitBackgroundClip: animated ? "text" : "unset",
        WebkitTextFillColor: animated ? "transparent" : "unset",
      }}>
        {vacant ? "Вакантно" : username}
      </div>
      <div style={{ fontSize: "11px", color: "#cc0000", marginBottom: "13px", lineHeight: 1.3 }}>
        {title}
      </div>
      <div style={{ borderTop: "1px solid #2a2a3e", marginBottom: "13px" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "11px", color: "#666" }}>РАНГ</span>
        <span style={{ fontSize: "14px", fontWeight: "bold", color: "#cc0000" }}>{rank}</span>
      </div>
    </div>
  )
}

function Section({
  title,
  positions,
  map,
}: {
  title: string
  positions: typeof LEAD_POSITIONS
  map: Record<string, string>
}) {
  const groups = groupByRank(positions)
  const ranks = Object.keys(groups)
    .map(Number)
    .sort((a, b) => b - a)

  return (
    <>
      <div style={{
        fontSize: "24px",
        fontWeight: 900,
        color: "#cc0000",
        textAlign: "center",
        letterSpacing: "2px",
        textShadow: "0 0 20px rgba(204,0,0,0.4)",
        marginBottom: "16px",
        marginTop: "8px",
        fontFamily: "Arial, sans-serif",
      }}>
        {title}
      </div>
      {ranks.map((rank) => (
        <div key={rank} style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap" as const,
          justifyContent: "center",
          marginBottom: "16px",
        }}>
          {groups[rank].map((p) => (
            <Card
              key={p.pt}
              title={p.title}
              username={map[p.pt] ?? null}
              rank={p.rank}
            />
          ))}
        </div>
      ))}
    </>
  )
}

export default async function StaffEmbedPage() {
  const staff = await getStaff()
  const map = buildMap(staff)

  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Состав РЖД</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            background: #0d0d1a;
            font-family: Arial, sans-serif;
            padding: 20px 12px 28px;
          }
          @keyframes rzd-g {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
        `}</style>
      </head>
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
          <Section title="Руководящий Состав" positions={LEAD_POSITIONS} map={map} />
          <div style={{ height: "16px" }} />
          <Section title="Старший Состав" positions={SENIOR_POSITIONS} map={map} />
        </div>
      </body>
    </html>
  )
}
