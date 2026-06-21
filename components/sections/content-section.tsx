"use client"

import { useState, useEffect } from "react"
import { LecturesSection } from "./lectures-section"
import { TrainingSection } from "./training-section"
import { EventsSection } from "./events-section"
import { ExamsSection } from "./exams-section"
import { InterviewsSection } from "./interviews-section"
import { ReportsSection } from "./reports-section"
import { OrdersSection } from "./orders-section"
import { ReportCompilerSection } from "./report-compilers-section"
import { ContentsSection } from "./contents-section"
import { AdminSection } from "./admin-section"
import { GovWaveSection } from "./gov-wave-section"
import { InformationSection } from "./information-section"
import { DutySection } from "./duty-section"
import { RadioReportsSection } from "./radio-reports-section"
import { ReportGenerationSection } from "./report-generation-section"
import { RetroTrainSection } from "./retro-train-section"
import { RZDWebsiteSection } from "./rzd-website-section"
import { BugReportSection } from "./bug-report-section"
import { TrainScheduleSection } from "./train-schedule-section"
import { CustomSectionView } from "./custom-section-view"
import { getCustomSections, type CustomSection } from "@/data/custom-sections"
import type { UserRole } from "@/data/users"

const SECTION_LABELS: Record<string, string> = {
  contents: "Содержание",
  information: "Информация",
  lectures: "Лекции",
  training: "Тренировки",
  events: "Мероприятия",
  exams: "Экзамены",
  interviews: "Собеседования",
  "retro-train": "Ретропоезд",
  duty: "Дежурство",
  orders: "Приказы",
  "reports-section": "Доклады в рацию",
  "gov-wave": "Гос. волна",
  "report-generation": "Генерация отчётов",
  "report-compiler": "Составитель докладов",
  "rzd-website": "Официальные уведомления",
  "train-schedule": "Расписание рейсов",
  admin: "Управление",
  "bug-report": "Баг-репорт",
}

interface ContentSectionProps {
  activeSection: string
  onSectionChange: (section: string) => void
  userRole?: UserRole
  userNickname?: string
}

function SectionWrapper({ activeSection, children }: { activeSection: string; children: React.ReactNode }) {
  return <>{children}</>
}

// Built-in section IDs — any activeSection NOT in this set is treated as a potential custom section
const BUILTIN_IDS = new Set([
  "contents", "information", "duty", "reports-section", "lectures", "training",
  "events", "exams", "interviews", "retro-train", "reports", "orders", "gov-wave",
  "report-compiler", "admin", "report-generation", "rzd-website", "train-schedule", "bug-report",
])

export function ContentSection({ activeSection, onSectionChange, userRole, userNickname }: ContentSectionProps) {
  const [customSections, setCustomSections] = useState<CustomSection[]>([])
  const [customSectionsLoaded, setCustomSectionsLoaded] = useState(false)

  useEffect(() => {
    getCustomSections().then((data) => {
      setCustomSections(data)
      setCustomSectionsLoaded(true)
    })
    const handler = () => getCustomSections().then(setCustomSections)
    window.addEventListener("customSectionsUpdated", handler)
    return () => window.removeEventListener("customSectionsUpdated", handler)
  }, [])

  const customSection = customSections.find((cs) => cs.id === activeSection)
  const isBuiltin = BUILTIN_IDS.has(activeSection)

  // If activeSection looks like a custom section but hasn't loaded yet — show skeleton
  if (!isBuiltin && !customSectionsLoaded) {
    return (
      <SectionWrapper activeSection={activeSection}>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 rounded-xl bg-white/10 w-1/3" />
          <div className="h-4 rounded-lg bg-white/5 w-full" />
          <div className="h-4 rounded-lg bg-white/5 w-4/5" />
          <div className="h-4 rounded-lg bg-white/5 w-3/5" />
        </div>
      </SectionWrapper>
    )
  }

  const inner = (() => {
    // Custom section takes priority if found
    if (customSection) {
      return <CustomSectionView section={customSection} userRole={userRole} />
    }
    switch (activeSection) {
      case "information":
        return <InformationSection userRole={userRole} />
      case "duty":
        return <DutySection />
      case "reports-section":
        return <RadioReportsSection userRole={userRole} />
      case "contents":
        return <ContentsSection onSectionChange={onSectionChange} userRole={userRole || "ЦдУД"} />
      case "lectures":
        return <LecturesSection />
      case "training":
        return <TrainingSection />
      case "events":
        return <EventsSection />
      case "exams":
        return <ExamsSection />
      case "interviews":
        return <InterviewsSection />
      case "retro-train":
        return <RetroTrainSection />
      case "reports":
        return <ReportsSection />
      case "orders":
        return <OrdersSection />
      case "gov-wave":
        return <GovWaveSection />
      case "report-compiler":
        return <ReportCompilerSection userRole={userRole || "ЦдУД"} userNickname={userNickname} />
      case "admin":
        return <AdminSection />
      case "report-generation":
        return <ReportGenerationSection />
      case "rzd-website":
        return <RZDWebsiteSection userRole={userRole || "ЦдУД"} userNickname={userNickname} />
      case "train-schedule":
        return <TrainScheduleSection userRole={userRole || "ЦдУД"} userNickname={userNickname} />
      case "bug-report":
        return <BugReportSection />
      default:
        // Non-builtin ID: show skeleton while loading, "not found" after load
        if (!isBuiltin) {
          if (!customSectionsLoaded) {
            return (
              <div className="space-y-4 animate-pulse">
                <div className="h-8 rounded-xl bg-white/10 w-1/3" />
                <div className="h-4 rounded-lg bg-white/5 w-full" />
                <div className="h-4 rounded-lg bg-white/5 w-4/5" />
              </div>
            )
          }
          return (
            <div className="py-16 text-center opacity-40">
              <p className="text-sm">Раздел не найден</p>
            </div>
          )
        }
        return <InformationSection userRole={userRole} />
    }
  })()

  return <SectionWrapper activeSection={activeSection}>{inner}</SectionWrapper>
}
