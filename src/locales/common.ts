import type { Language } from '@/types'

const rows = [
  ["Закрыть","Close","Cerrar","Fermer","Schließen","Fechar"],
  ["Урок","Lesson","Lección","Leçon","Lektion","Lição"],
  ["Адаптивная","Adaptive","Adaptativa","Adaptatif","Adaptiv","Adaptativo"],
  ["Орбита","Orbit","Órbita","Orbite","Orbit","Órbita"],
  ["Спринт","Sprint","Sprint","Sprint","Sprint","Sprint"],
  ["Диагностика","Assessment","Evaluación","Évaluation","Einstufung","Avaliação"],
  ["Контроль","Benchmark","Prueba de referencia","Test de référence","Vergleichstest","Teste de referência"],
  ["Точность","Accuracy","Precisión","Précision","Genauigkeit","Precisão"],
  ["Повтор","Review","Repaso","Révision","Wiederholung","Revisão"],
  ["Переходы между буквами","Letter transitions","Transiciones entre letras","Transitions entre lettres","Buchstabenübergänge","Transições entre letras"],
  ["Свой текст","Your text","Tu texto","Votre texte","Eigener Text","Seu texto"],
  ["Новый отрывок","New passage","Pasaje nuevo","Nouvel extrait","Neuer Abschnitt","Novo trecho"],
  ["Смена раскладки","Layout switching","Cambio de distribución","Changement de disposition","Layoutwechsel","Mudança de disposição"],
  ["Хардкор","Hardcore","Modo extremo","Mode intense","Hardcore","Modo extremo"],
  ["пробел","space","espacio","espace","Leertaste","espaço"],
  ["Пробел","Space","Espacio","Espace","Leertaste","Espaço"],
  ["сл/мин","WPM","pal/min","mots/min","Wörter/min","pal/min"],
  ["знаков","characters","caracteres","caractères","Zeichen","caracteres"],
  ["знак","character","carácter","caractère","Zeichen","carácter"],
  ["мс","ms","ms","ms","ms","ms"],
  ["сек","s","s","s","Sek.","s"],
  ["мин","min","min","min","Min.","min"],
  ["п.п.","pp","pp","pp","Pp.","pp"],
  ["раз","times","veces","fois","Mal","vezes"],
  ["takt.. · загружаем профиль…","takt.. · Loading your profile…","takt.. · Cargando el perfil…","takt.. · Chargement du profil…","takt.. · Profil wird geladen…","takt.. · A carregar o perfil…"],
  ["Не удалось открыть профиль","Could not open your profile","No se pudo abrir el perfil","Impossible d’ouvrir le profil","Das Profil konnte nicht geöffnet werden","Não foi possível abrir o perfil"],
  ["Повтори загрузку после восстановления доступа к данным.","Try again once access to your data is restored.","Vuelve a intentarlo cuando se restablezca el acceso a tus datos.","Réessayez une fois l’accès à vos données rétabli.","Versuche es erneut, sobald der Zugriff auf deine Daten wiederhergestellt ist.","Tente novamente quando o acesso aos dados for restabelecido."],
  ["Повторить загрузку","Try again","Volver a intentar","Réessayer","Erneut versuchen","Tentar novamente"],
  ["Не удалось сохранить настройки.","Could not save your settings.","No se pudo guardar la configuración.","Impossible d’enregistrer les paramètres.","Die Einstellungen konnten nicht gespeichert werden.","Não foi possível guardar as definições."],
  ["Для недельного сравнения нужна практика в обоих периодах","Practice in both periods to compare your weekly pace","Practica en ambos periodos para comparar tu ritmo semanal","Entraînez-vous sur les deux périodes pour comparer votre cadence","Übe in beiden Zeiträumen, um dein Wochentempo zu vergleichen","Pratique nos dois períodos para comparar o ritmo semanal"],
  ["{wpm} сл/мин · последние 7 дней к предыдущим 7","{wpm} WPM · last 7 days vs. previous 7","{wpm} pal/min · últimos 7 días frente a los 7 anteriores","{wpm} mots/min · 7 derniers jours par rapport aux 7 précédents","{wpm} Wörter/min · letzte 7 Tage gegenüber den 7 Tagen davor","{wpm} pal/min · últimos 7 dias face aos 7 anteriores"],
  ["Отчёт для ИИ","Report for AI","Informe para IA","Rapport pour l’IA","Bericht für KI","Relatório para IA"],
  ["Экспорт {format}","Export {format}","Exportar {format}","Exporter au format {format}","{format} exportieren","Exportar {format}"],
] as const

const locales = ['en', 'es', 'fr', 'de', 'pt'] as const
export const commonMessages: Partial<Record<Language, Record<string, string>>> = Object.fromEntries(
  locales.map((locale, index) => [locale, Object.fromEntries(rows.map(([message, ...versions]) => [message, versions[index]]))]),
)
