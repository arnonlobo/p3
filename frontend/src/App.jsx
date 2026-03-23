import React, { useState, useEffect } from "react";
import {
  Play,
  CheckSquare,
  Clock,
  Plus,
  Trash2,
  AlertTriangle,
  RotateCcw,
  ListTodo,
  Edit3,
  Save,
  AlignLeft,
  Copy,
  ArrowLeft,
  CalendarDays,
  FastForward,
  PlayCircle,
  Search,
  Layers,
  ArrowUp,
  ArrowDown,
  SkipForward,
  MapPin,
  User,
  Database,
} from "lucide-react";

// --- CONFIGURAÇÃO DA API (NODE.JS + SQLITE) ---
// Em produção na VPS, altere 'localhost' pelo IP/Domínio da sua API
const API_URL = "/api/sessions";

// --- FUNÇÃO PARA LER TEMPO DO TEXTO (ex: 3'30", 5', 30") ---
const parseTimeToSeconds = (text) => {
  let total = 0;
  const minMatch = text.match(/(\d+)'/);
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  const secMatch = text.match(/(\d+)("|'')/);
  if (secMatch) total += parseInt(secMatch[1], 10);
  return total;
};

// --- FUNÇÃO PARA FORMATAR SEGUNDOS (ex: 3m 30s) ---
const formatSecsToMinSec = (secs) => {
  if (!secs) return "0s";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
};

// --- DADOS INICIAIS ---
const DAYS_OF_WEEK = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];

const defaultActivities = [
  {
    id: "1",
    title: "Conferência do efetivo",
    location: "Pátio APM",
    responsible: "EM AFP e Cmt Pel",
    duration: 15,
    originalDuration: 15,
    status: "pending",
    startTime: null,
    endTime: null,
    exercises: [
      {
        id: "1_1",
        text: "Conferência do anúncio",
        completed: false,
        parsedSeconds: 0,
        originalParsedSeconds: 0,
      },
    ],
  },
  {
    id: "2",
    title: "1ª série de calistenia",
    location: "Pista",
    responsible: "Locutor e Guia",
    duration: 50,
    originalDuration: 50,
    status: "pending",
    startTime: null,
    endTime: null,
    exercises: [
      {
        id: "e1",
        text: "Polichinelo com Fuzil (200x) - 3'30\"",
        completed: false,
        parsedSeconds: 210,
        originalParsedSeconds: 210,
      },
      {
        id: "e2",
        text: "Flexão de Braço (20x) - 1'30\"",
        completed: false,
        parsedSeconds: 90,
        originalParsedSeconds: 90,
      },
    ],
  },
];

const getDefaultTime = () => {
  const t = new Date();
  t.setHours(12, 30, 0, 0);
  return t;
};

// --- FUNÇÕES DE SERIALIZAÇÃO PARA O FIREBASE ---
const serializeSession = (session) => JSON.parse(JSON.stringify(session));

const deserializeSession = (s) => ({
  ...s,
  plannedStartTime: s.plannedStartTime ? new Date(s.plannedStartTime) : null,
  targetEndTime: s.targetEndTime ? new Date(s.targetEndTime) : null,
  activities: s.activities.map((a) => ({
    ...a,
    startTime: a.startTime ? new Date(a.startTime) : null,
    endTime: a.endTime ? new Date(a.endTime) : null,
    originalStartTime: a.originalStartTime
      ? new Date(a.originalStartTime)
      : null,
    originalEndTime: a.originalEndTime ? new Date(a.originalEndTime) : null,
    location: a.location || "",
    responsible: a.responsible || "",
    exercises: (a.exercises || []).map((ex) => {
      const pSecs =
        ex.parsedSeconds !== undefined
          ? ex.parsedSeconds
          : parseTimeToSeconds(ex.text);
      return {
        ...ex,
        parsedSeconds: pSecs,
        originalParsedSeconds:
          ex.originalParsedSeconds !== undefined
            ? ex.originalParsedSeconds
            : pSecs,
      };
    }),
  })),
});

export default function App() {
  const [dbStatus, setDbStatus] = useState("Conectando...");

  const [sessions, setSessions] = useState([]);
  // Modifique a declaração inicial para buscar da memória (LocalStorage)
  const [currentSessionId, setCurrentSessionId] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("p3_current_session_id") || null;
    }
    return null;
  });

  // Adicione este useEffect logo abaixo para salvar automaticamente sempre que mudar de tela
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem("p3_current_session_id", currentSessionId);
    } else {
      localStorage.removeItem("p3_current_session_id");
    }
  }, [currentSessionId]);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [now, setNow] = useState(new Date());

  // Estados para inputs e modais
  const [exerciseInputs, setExerciseInputs] = useState({});
  const [blockSelects, setBlockSelects] = useState({});
  const [quickAddText, setQuickAddText] = useState("");
  const [quickAddActivityText, setQuickAddActivityText] = useState("");

  // Custom Modal State
  const [modal, setModal] = useState({
    isOpen: false,
    type: "",
    title: "",
    message: "",
    value: "",
    onConfirm: null,
  });

  // === BUSCA INICIAL DE DADOS (NODE API ou LOCALSTORAGE) ===
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error("Servidor indisponível");
        const data = await res.json();

        if (data.length > 0) {
          setSessions(data.map(deserializeSession));
        } else {
          const defaultSess = {
            id: `session-default-${Date.now()}`,
            day: "Segunda",
            title: "Instrução Principal (Exemplo)",
            status: "planning",
            plannedStartTime: getDefaultTime(),
            targetEndTime: null,
            activities: defaultActivities,
          };
          setSessions([defaultSess]);
          saveSessionToDB(defaultSess);
        }
        setDbStatus("SQLite Online");
      } catch {
        console.warn("API Offline, usando modo de segurança LocalStorage");
        setDbStatus("Modo Offline (Local)");
        const saved = localStorage.getItem("p3_weekly_sessions");
        if (saved) {
          setSessions(JSON.parse(saved).map(deserializeSession));
        } else {
          const defaultSess = {
            id: `session-default-${Date.now()}`,
            day: "Segunda",
            title: "Instrução Principal (Exemplo)",
            status: "planning",
            plannedStartTime: getDefaultTime(),
            targetEndTime: null,
            activities: defaultActivities,
          };
          setSessions([defaultSess]);
        }
      }
    };
    fetchSessions();
  }, []);

  // Gravação local contínua para backup/modo offline
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("p3_weekly_sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    // Tick normal a cada segundo
    const interval = setInterval(() => setNow(new Date()), 1000);

    // Ao voltar para a aba (após fechar/minimizar/trocar de aba),
    // força uma atualização imediata do relógio para o cronômetro não ficar parado
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setNow(new Date());
      }
    };

    // Ao ganhar foco na janela também atualiza
    const handleFocus = () => setNow(new Date());

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // === MÉTODOS DE ESCRITA NO DB (NODE/SQLITE) ===
  const saveSessionToDB = async (session) => {
    try {
      await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializeSession(session)),
      });
      setDbStatus("SQLite Online");
    } catch {
      setDbStatus("Modo Offline (Local)");
    }
  };

  const deleteSessionFromDB = async (sessionId) => {
    try {
      await fetch(`${API_URL}/${sessionId}`, { method: "DELETE" });
      setDbStatus("SQLite Online");
    } catch {
      setDbStatus("Modo Offline (Local)");
    }
  };

  // === SISTEMA DE MODAIS CUSTOMIZADOS ===
  const openPrompt = (title, message, defaultValue, onConfirm) => {
    setModal({
      isOpen: true,
      type: "prompt",
      title,
      message,
      value: defaultValue,
      onConfirm,
    });
  };
  const openConfirm = (title, message, onConfirm) => {
    setModal({
      isOpen: true,
      type: "confirm",
      title,
      message,
      value: "",
      onConfirm,
    });
  };
  const openAlert = (title, message) => {
    setModal({
      isOpen: true,
      type: "alert",
      title,
      message,
      value: "",
      onConfirm: () => {},
    });
  };

  const formatTime = (date) =>
    date
      ? date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
      : "--:--";
  const formatDuration = (ms) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // === GERAR BIBLIOTECA DE EXERCÍCIOS E BLOCOS ===
  const allBlocks = [];
  sessions.forEach((s) => {
    s.activities.forEach((a) => {
      const validEx = (a.exercises || []).filter((e) => e.text.trim());
      if (validEx.length > 0) {
        allBlocks.push({
          id: `${s.id}-${a.id}`,
          label: `${s.title} > ${a.title}`,
          text: validEx.map((e) => e.text).join("\n"),
        });
      }
    });
  });
  const allExercisesDatalist = Array.from(
    new Set(allBlocks.flatMap((b) => b.text.split("\n"))),
  );

  // === AÇÕES DO PAINEL SEMANAL ===
  const createSession = (day) => {
    openPrompt(
      "Nova Sessão",
      `Qual o nome da sessão de ${day}? (Ex: Manhã, Tiro)`,
      "Nova Sessão",
      (title) => {
        if (!title) return;
        const newTime = new Date();
        newTime.setHours(8, 0, 0, 0);
        const newSess = {
          id: `s-${Date.now()}`,
          day,
          title,
          status: "planning",
          plannedStartTime: newTime,
          targetEndTime: null,
          activities: [
            {
              id: Date.now().toString(),
              title: "Primeira Atividade",
              location: "",
              responsible: "",
              duration: 15,
              originalDuration: 15,
              status: "pending",
              startTime: null,
              endTime: null,
              exercises: [],
            },
          ],
        };
        setSessions((prev) => [...prev, newSess]);
        setCurrentSessionId(newSess.id);
        saveSessionToDB(newSess);
      },
    );
  };

  const deleteSession = (e, id) => {
    e.stopPropagation();
    openConfirm(
      "Atenção",
      "Apagar esta sessão por completo e permanentemente?",
      () => {
        deleteSessionFromDB(id);
        if (currentSessionId === id) setCurrentSessionId(null);
      },
    );
  };

  // === AÇÕES DO GESTOR DE SESSÃO ===
  const updateActiveSession = (updater) => {
    setSessions((prev) => {
      const next = prev.map((s) => {
        if (s.id === currentSessionId) {
          return typeof updater === "function" ? updater(s) : { ...s, ...updater };
        }
        return s;
      });
      // Encontra a sessão atualizada dentro do updater para salvar no DB de forma correta
      const updatedSess = next.find((s) => s.id === currentSessionId);
      if (updatedSess) saveSessionToDB(updatedSess);
      return next;
    });
  };

  const handleStartTimeChange = (e) => {
    const [hours, minutes] = e.target.value.split(":");
    updateActiveSession((s) => {
      const newDate = new Date(s.plannedStartTime);
      newDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
      return { ...s, plannedStartTime: newDate };
    });
  };

  const updateSessionTitle = (newTitle) =>
    updateActiveSession({ title: newTitle });

  const startSession = (activeSession, startIndex = 0) => {
    if (activeSession.activities.length === 0) return;

    let currentOriginalCursor = new Date(activeSession.plannedStartTime);
    const initialTotalMins = activeSession.activities.reduce(
      (acc, a) => acc + (a.originalDuration || a.duration),
      0,
    );
    const calculatedTarget = new Date(
      activeSession.plannedStartTime.getTime() + initialTotalMins * 60000,
    );
    const nowTime = new Date();

    updateActiveSession((s) => ({
      ...s,
      status: "running",
      targetEndTime: calculatedTarget,
      activities: s.activities.map((a, i) => {
        const origStart = new Date(currentOriginalCursor);
        const origEnd = new Date(
          currentOriginalCursor.getTime() +
            (a.originalDuration || a.duration) * 60000,
        );
        currentOriginalCursor = origEnd;

        let newStatus = a.status,
          newStartTime = a.startTime,
          newEndTime = a.endTime;
        if (s.status === "planning") {
          if (i < startIndex) {
            newStatus = "completed";
            newStartTime = origStart;
            newEndTime = origEnd;
          } else if (i === startIndex) {
            newStatus = "running";
            newStartTime = nowTime;
          } else {
            newStatus = "pending";
            newStartTime = null;
            newEndTime = null;
          }
        }
        return {
          ...a,
          originalStartTime: origStart,
          originalEndTime: origEnd,
          status: newStatus,
          startTime: newStartTime,
          endTime: newEndTime,
        };
      }),
    }));
    setIsEditingMode(false);
  };

  const jumpToActivity = (targetId) => {
    openConfirm(
      "Avançar Atividade",
      "Avançar cronómetro para esta atividade? As atividades anteriores serão dadas como concluídas.",
      () => {
        const nowTime = new Date();
        updateActiveSession((s) => {
          const targetIndex = s.activities.findIndex((a) => a.id === targetId);
          return {
            ...s,
            activities: s.activities.map((a, i) => {
              if (a.status === "completed") return a;
              if (i < targetIndex)
                return {
                  ...a,
                  status: "completed",
                  endTime:
                    a.status === "running"
                      ? nowTime
                      : a.originalEndTime || nowTime,
                  startTime: a.startTime || a.originalStartTime || nowTime,
                };
              if (i === targetIndex)
                return { ...a, status: "running", startTime: nowTime };
              return a;
            }),
          };
        });
      },
    );
  };

  const nextActivity = (currentId) => {
    const endTime = new Date();
    updateActiveSession((s) => {
      const acts = [...s.activities];
      const index = acts.findIndex((a) => a.id === currentId);
      acts[index] = { ...acts[index], status: "completed", endTime };
      let newStatus = "running";
      if (index + 1 < acts.length)
        acts[index + 1] = {
          ...acts[index + 1],
          status: "running",
          startTime: endTime,
        };
      else newStatus = "completed";
      return { ...s, status: newStatus, activities: acts };
    });
  };

  const resetSession = () => {
    openConfirm(
      "Reiniciar",
      "CUIDADO: Tem a certeza que deseja reiniciar todo o planeamento desta sessão?",
      () => {
        updateActiveSession((s) => ({
          ...s,
          status: "planning",
          targetEndTime: null,
          activities: s.activities.map((a) => ({
            ...a,
            status: "pending",
            startTime: null,
            endTime: null,
            originalStartTime: null,
            originalEndTime: null,
            duration: a.originalDuration || a.duration,
            exercises: (a.exercises || []).map((e) => ({
              ...e,
              completed: false,
              cancelled: false,
              parsedSeconds: e.originalParsedSeconds,
            })),
          })),
        }));
      },
    );
  };

  const updateActivityField = (id, field, value) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) => {
        if (a.id !== id) return a;
        const updated = { ...a, [field]: value };
        if (field === "duration") updated.originalDuration = value;
        return updated;
      }),
    }));
  };

  const renameActivityOnTheFly = (id, currentTitle) => {
    openPrompt(
      "Renomear Atividade",
      "Insira o novo título da atividade:",
      currentTitle,
      (newTitle) => {
        if (newTitle && newTitle.trim())
          updateActivityField(id, "title", newTitle.trim());
      },
    );
  };

  const adjustCurrentDuration = (id, amount) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) =>
        a.id === id ? { ...a, duration: Math.max(1, a.duration + amount) } : a,
      ),
    }));
  };

  const quickAddActivity = (title) => {
    if (!title.trim()) return;
    updateActiveSession((s) => ({
      ...s,
      activities: [
        ...s.activities,
        {
          id: Date.now().toString(),
          title: title.trim(),
          location: "",
          responsible: "",
          duration: 15,
          originalDuration: 15,
          status: "pending",
          startTime: null,
          endTime: null,
          exercises: [],
        },
      ],
    }));
    setQuickAddActivityText("");
  };

  const moveActivity = (index, dir) => {
    updateActiveSession((s) => {
      const newActs = [...s.activities];
      if (dir === -1 && index > 0) {
        if (newActs[index - 1].status !== "pending") return s;
        [newActs[index - 1], newActs[index]] = [
          newActs[index],
          newActs[index - 1],
        ];
      } else if (dir === 1 && index < newActs.length - 1) {
        [newActs[index + 1], newActs[index]] = [
          newActs[index],
          newActs[index + 1],
        ];
      }
      return { ...s, activities: newActs };
    });
  };

  const deleteActivity = (id) => {
    openConfirm("Remover", "Remover esta atividade por completo?", () => {
      updateActiveSession((s) => ({
        ...s,
        activities: s.activities.filter((a) => a.id !== id),
      }));
    });
  };

  const adjustExerciseTime = (activityId, exerciseId, amountSeconds) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) => {
        if (a.id !== activityId) return a;
        return {
          ...a,
          exercises: a.exercises.map((ex) => {
            if (ex.id !== exerciseId) return ex;
            return {
              ...ex,
              parsedSeconds: Math.max(
                0,
                (ex.parsedSeconds || 0) + amountSeconds,
              ),
            };
          }),
        };
      }),
    }));
  };

  const handleTextareaChange = (activityId, rawText) => {
    const lines = rawText.split("\n");
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) => {
        if (a.id !== activityId) return a;
        const newExercises = lines.map((line, idx) => {
          const existing = a.exercises[idx];
          const pSecs = parseTimeToSeconds(line);
          const keepsExisting = existing && existing.text === line;
          return {
            id: existing ? existing.id : `${Date.now()}-${idx}`,
            text: line,
            completed: existing ? existing.completed : false,
            parsedSeconds: keepsExisting
              ? (existing.parsedSeconds ?? pSecs)
              : pSecs,
            originalParsedSeconds: keepsExisting
              ? (existing.originalParsedSeconds ?? pSecs)
              : pSecs,
          };
        });
        return { ...a, exercises: newExercises };
      }),
    }));
  };

  const appendTextToActivity = (activityId, textToAppend) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) => {
        if (a.id !== activityId) return a;
        const currentText = a.exercises.map((e) => e.text).join("\n");
        const newText = currentText.trim()
          ? `${currentText}\n${textToAppend}`
          : textToAppend;

        const lines = newText.split("\n");
        const newExercises = lines.map((line, idx) => {
          const existing = a.exercises[idx];
          const pSecs = parseTimeToSeconds(line);
          const keepsExisting = existing && existing.text === line;
          return {
            id: existing ? existing.id : `${Date.now()}-${idx}`,
            text: line,
            completed: existing ? existing.completed : false,
            cancelled: existing ? existing.cancelled : false,
            parsedSeconds: keepsExisting
              ? (existing.parsedSeconds ?? pSecs)
              : pSecs,
            originalParsedSeconds: keepsExisting
              ? (existing.originalParsedSeconds ?? pSecs)
              : pSecs,
          };
        });
        return { ...a, exercises: newExercises };
      }),
    }));
  };

  // NOVO: Função que verifica se há tempo; caso não, aplica 5'00" por padrão
  const appendExerciseWithDefaultTime = (
    activityId,
    textToAppend,
    clearInputFn,
  ) => {
    let finalTxt = (textToAppend || "").trim();
    if (!finalTxt) return;

    // Se não tiver indicador de minutos (') ou segundos ("), adiciona o padrão 5'00"
    if (!finalTxt.includes("'") && !finalTxt.includes('"')) {
      finalTxt += " - 5'00\"";
    }

    appendTextToActivity(activityId, finalTxt);
    if (clearInputFn) clearInputFn("");
  };

  const moveExercise = (activityId, index, dir) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) => {
        if (a.id !== activityId) return a;
        const newEx = [...a.exercises];
        if (dir === -1 && index > 0) {
          [newEx[index - 1], newEx[index]] = [newEx[index], newEx[index - 1]];
        } else if (dir === 1 && index < newEx.length - 1) {
          [newEx[index + 1], newEx[index]] = [newEx[index], newEx[index + 1]];
        }
        return { ...a, exercises: newEx };
      }),
    }));
  };

  const cancelExercise = (activityId, exerciseId) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) => {
        if (a.id !== activityId) return a;
        return {
          ...a,
          exercises: a.exercises.map((ex) => {
            if (ex.id !== exerciseId) return ex;
            const isNowCancelled = !ex.cancelled;
            return {
              ...ex,
              cancelled: isNowCancelled,
              parsedSeconds: isNowCancelled
                ? 0
                : ex.originalParsedSeconds || parseTimeToSeconds(ex.text),
            };
          }),
        };
      }),
    }));
  };

  const finishExerciseEarly = (activityId, exerciseId, elapsedMsForEx) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) => {
        if (a.id !== activityId) return a;
        return {
          ...a,
          exercises: a.exercises.map((ex) => {
            if (ex.id !== exerciseId) return ex;
            return {
              ...ex,
              parsedSeconds: Math.max(0, Math.floor(elapsedMsForEx / 1000)),
            };
          }),
        };
      }),
    }));
  };

  const toggleExerciseTimeline = (activityId, exerciseId) => {
    updateActiveSession((s) => ({
      ...s,
      activities: s.activities.map((a) =>
        a.id === activityId
          ? {
              ...a,
              exercises: a.exercises.map((e) =>
                e.id === exerciseId ? { ...e, completed: !e.completed } : e,
              ),
            }
          : a,
      ),
    }));
  };

  const addNewActivity = () => {
    updateActiveSession((s) => ({
      ...s,
      activities: [
        ...s.activities,
        {
          id: Date.now().toString(),
          title: "Nova Atividade",
          location: "",
          responsible: "",
          duration: 15,
          originalDuration: 15,
          status: "pending",
          startTime: null,
          endTime: null,
          exercises: [],
        },
      ],
    }));
  };

  const generateWhatsAppReport = () => {
    let report = `*RELATÓRIO DE INSTRUÇÃO - P3* 📋\n`;
    report += `📅 *Dia:* ${activeSession.day}\n`;
    report += `📍 *Sessão:* ${activeSession.title}\n\n`;
    const actualStart =
      activeSession.activities[0]?.startTime || plannedStartTime;
    const actualEnd =
      activeSession.activities[activeSession.activities.length - 1]?.endTime ||
      new Date();
    report += `⏱️ *Início Efetivo:* ${formatTime(actualStart)}\n`;
    report += `🏁 *Término Efetivo:* ${formatTime(actualEnd)}\n`;

    let deviationMins = 0;
    if (targetEndTime)
      deviationMins = Math.round(
        (estimatedEndTime.getTime() - targetEndTime.getTime()) / 60000,
      );

    if (deviationMins > 0)
      report += `⚠️ *Desvio Global:* Atraso de ${deviationMins} min\n\n`;
    else if (deviationMins < 0)
      report += `⚡ *Desvio Global:* Adiantado em ${Math.abs(deviationMins)} min\n\n`;
    else report += `✅ *Desvio Global:* No horário exato\n\n`;
    report += `*--- DETALHAMENTO ---*\n\n`;

    activeSession.activities.forEach((act, idx) => {
      report += `*${idx + 1}. ${act.title}*\n`;
      if (act.location) report += `📍 Local: ${act.location}\n`;
      if (act.responsible) report += `👤 Resp: ${act.responsible}\n`;

      report += `🕒 Previsto: ${formatTime(act.originalStartTime)} às ${formatTime(act.originalEndTime)} (${act.originalDuration}m)\n`;
      report += `✅ Realizado: ${formatTime(act.startTime)} às ${formatTime(act.endTime)} (${act.duration}m)\n`;
      if (act.duration > act.originalDuration)
        report += `⚠️ _Acréscimo de ${act.duration - act.originalDuration}m_\n`;
      else if (act.duration < act.originalDuration)
        report += `⚡ _Redução de ${act.originalDuration - act.duration}m_\n`;

      const validExercises = (act.exercises || []).filter(
        (e) => e.text.trim() !== "",
      );
      if (validExercises.length > 0) {
        report += `📝 Rastro e Detalhes:\n`;
        validExercises.forEach((ex) => {
          let timeTrail = "";
          if (ex.cancelled) {
            report += `  - ~${ex.text}~ (Cancelado)\n`;
          } else {
            if (ex.parsedSeconds > 0) {
              timeTrail = ` [⏱️ ${formatSecsToMinSec(ex.parsedSeconds)}`;
              if (ex.parsedSeconds !== ex.originalParsedSeconds) {
                timeTrail += ` | Prev: ${formatSecsToMinSec(ex.originalParsedSeconds)}`;
              }
              timeTrail += `]`;
            }
            report += `  - ${ex.text}${timeTrail}\n`;
          }
        });
      }
      report += `\n`;
    });

    const textArea = document.createElement("textarea");
    textArea.value = report;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      openAlert("Sucesso", "✅ Relatório copiado com sucesso!");
    } catch {
      openAlert(
        "Erro",
        "❌ Erro ao copiar relatório. O navegador pode ter bloqueado.",
      );
    }
    document.body.removeChild(textArea);
  };

  // === RENDERIZAÇÃO DO MODAL CUSTOMIZADO ===
  const CustomModal = () => {
    if (!modal.isOpen) return null;
    return (
      <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in zoom-in-95 duration-200">
          <h3 className="text-xl font-bold text-white mb-2">{modal.title}</h3>
          <p className="text-slate-400 mb-6">{modal.message}</p>

          {modal.type === "prompt" && (
            <input
              type="text"
              value={modal.value}
              onChange={(e) => setModal({ ...modal, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  modal.onConfirm(modal.value);
                  setModal({ ...modal, isOpen: false });
                }
              }}
              className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none mb-6 font-medium"
              autoFocus
            />
          )}

          <div className="flex justify-end gap-3">
            {modal.type !== "alert" && (
              <button
                onClick={() => setModal({ ...modal, isOpen: false })}
                className="px-5 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors font-bold"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={() => {
                modal.onConfirm(modal.value);
                setModal({ ...modal, isOpen: false });
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold transition-colors shadow-lg shadow-emerald-900/20"
            >
              {modal.type === "alert" ? "OK" : "Confirmar"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // === RENDERIZAÇÃO DO APP ===
  if (!currentSessionId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-20">
        <CustomModal />
        <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10 shadow-md">
          <div className="max-w-7xl mx-auto p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600 p-2 rounded-lg">
                <CalendarDays className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Painel Semanal de Instruções
                </h1>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-slate-400 font-mono">
                    {now.toLocaleTimeString("pt-PT")}
                  </p>
                  <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-emerald-500 font-bold flex items-center gap-1 border border-emerald-900/30">
                    <Database size={10} /> {dbStatus}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto p-4 mt-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {DAYS_OF_WEEK.map((day) => {
              const daySessions = sessions.filter((s) => s.day === day);
              return (
                <div
                  key={day}
                  className="bg-slate-900/50 rounded-2xl border border-slate-800 flex flex-col overflow-hidden"
                >
                  <div className="bg-slate-800 p-3 border-b border-slate-700 text-center">
                    <h2 className="font-bold text-emerald-500 uppercase tracking-widest text-sm">
                      {day}
                    </h2>
                  </div>
                  <div className="p-3 flex-1 flex flex-col gap-3">
                    {daySessions.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => setCurrentSessionId(session.id)}
                        className={`p-4 rounded-xl cursor-pointer transition-all border group relative shadow-md hover:-translate-y-1 ${session.status === "completed" ? "bg-slate-900 border-slate-800 opacity-70" : session.status === "running" ? "bg-emerald-950/40 border-emerald-800" : "bg-slate-800 border-slate-700 hover:border-emerald-500/50"}`}
                      >
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => deleteSession(e, session.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-md"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="flex justify-between items-start mb-2 pr-6">
                          <h3 className="font-bold text-white text-base leading-tight">
                            {session.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-3">
                          <Clock className="w-3 h-3" />{" "}
                          {session.status === "planning" ? "Início: " : ""}
                          {formatTime(session.plannedStartTime)}
                        </div>
                        <div>
                          {session.status === "planning" && (
                            <span className="text-[10px] bg-slate-700 px-2 py-1 rounded text-slate-300 font-bold uppercase tracking-wider">
                              Planeado
                            </span>
                          )}
                          {session.status === "running" && (
                            <span className="text-[10px] bg-emerald-600 px-2 py-1 rounded text-white font-bold uppercase tracking-wider animate-pulse">
                              Em Curso
                            </span>
                          )}
                          {session.status === "completed" && (
                            <span className="text-[10px] bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1 w-max">
                              <CheckSquare className="w-3 h-3" /> Concluído
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => createSession(day)}
                      className="mt-auto p-3 border-2 border-dashed border-slate-700 hover:border-emerald-600 hover:bg-slate-800/50 rounded-xl text-slate-500 hover:text-emerald-500 transition-colors flex items-center justify-center gap-2 text-sm font-bold"
                    >
                      <Plus className="w-4 h-4" /> NOVA SESSÃO
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  const activeSession = sessions.find((s) => s.id === currentSessionId);
  if (!activeSession) return null;

  const sessionStatus = activeSession.status;
  const plannedStartTime = activeSession.plannedStartTime;
  const targetEndTime = activeSession.targetEndTime;

  let cursor = sessionStatus === "planning" ? plannedStartTime : null;
  const computedActivities = activeSession.activities.map((act) => {
    if (act.status === "completed") {
      cursor = act.endTime;
      return { ...act, computedStart: act.startTime, computedEnd: act.endTime };
    }
    if (act.status === "running") {
      const expectedEnd = new Date(
        act.startTime.getTime() + act.duration * 60000,
      );
      const effectiveEnd = new Date(
        Math.max(expectedEnd.getTime(), now.getTime()),
      );
      cursor = effectiveEnd;
      return {
        ...act,
        computedStart: act.startTime,
        computedEnd: expectedEnd,
        isDelayed: now > expectedEnd,
      };
    }
    const start = new Date(cursor);
    const end = new Date(start.getTime() + act.duration * 60000);
    cursor = end;
    return { ...act, computedStart: start, computedEnd: end };
  });

  const estimatedEndTime =
    computedActivities.length > 0
      ? computedActivities[computedActivities.length - 1].computedEnd
      : plannedStartTime;
  const runningActivity = computedActivities.find(
    (a) => a.status === "running",
  );

  let deviationMins = 0;
  if (targetEndTime && sessionStatus !== "planning") {
    deviationMins = Math.round(
      (estimatedEndTime.getTime() - targetEndTime.getTime()) / 60000,
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-20">
      <CustomModal />
      <datalist id="exercise-datalist">
        {allExercisesDatalist.map((ex) => (
          <option key={ex} value={ex} />
        ))}
      </datalist>

      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10 shadow-md">
        <div className="max-w-3xl mx-auto p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <button
              onClick={() => setCurrentSessionId(null)}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-slate-300"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <span className="text-xs text-emerald-500 font-bold uppercase tracking-wider">
                {activeSession.day}
              </span>
              {isEditingMode ? (
                <input
                  type="text"
                  value={activeSession.title}
                  onChange={(e) => updateSessionTitle(e.target.value)}
                  className="bg-slate-800 text-white font-bold text-lg px-2 py-1 rounded border border-amber-500/50 focus:outline-none"
                />
              ) : (
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {activeSession.title}
                </h1>
              )}
            </div>
          </div>
          {sessionStatus === "planning" && (
            <button
              onClick={() => setIsEditingMode(!isEditingMode)}
              className={`flex items-center justify-center gap-2 px-6 py-2 rounded-md text-sm font-bold transition-colors w-full sm:w-auto ${isEditingMode ? "bg-amber-600 text-white shadow" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
            >
              {isEditingMode ? (
                <>
                  <Save className="w-4 h-4" /> SALVAR
                </>
              ) : (
                <>
                  <Edit3 className="w-4 h-4" /> EDITAR
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 mt-4">
        {sessionStatus !== "planning" && targetEndTime ? (
          <div className="flex flex-col sm:flex-row justify-between items-center mb-6 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <button
                onClick={resetSession}
                className="bg-red-950/50 hover:bg-red-900 text-red-400 px-3 py-2 rounded-lg border border-red-900/50 flex items-center gap-2 text-sm font-bold transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> REINICIAR
              </button>
              {deviationMins > 0 ? (
                <span className="bg-red-950 text-red-400 border border-red-900 px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-4 h-4" /> ATRASO DE{" "}
                  {deviationMins} MIN
                </span>
              ) : deviationMins < 0 ? (
                <span className="bg-blue-950 text-blue-400 border border-blue-900 px-3 py-2 rounded-lg text-sm font-bold">
                  ADIANTADO {Math.abs(deviationMins)} MIN
                </span>
              ) : (
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-900 px-3 py-2 rounded-lg text-sm font-bold">
                  NO HORÁRIO
                </span>
              )}
            </div>
            <div className="flex items-center gap-6 w-full sm:w-auto justify-end">
              <div className="text-right hidden sm:block">
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                  Término Alvo Original
                </span>
                <span className="text-lg font-mono font-bold text-slate-400">
                  {formatTime(targetEndTime)}
                </span>
              </div>
              <div className="text-right">
                <span className="block text-[10px] text-emerald-500 uppercase tracking-wider font-semibold">
                  Previsão Atual
                </span>
                <span
                  className={`text-xl font-mono font-bold px-2 py-1 rounded-md ${deviationMins > 0 ? "text-red-400 bg-red-950/30" : "text-emerald-400 bg-emerald-950/30"}`}
                >
                  {formatTime(estimatedEndTime)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-between items-center mb-6 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
            <span className="text-sm font-bold text-slate-400">
              Planeamento em curso
            </span>
            <div className="text-right flex items-center gap-3">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Término Previsto:
              </span>
              <span className="text-xl font-mono font-bold text-emerald-400 bg-slate-800 px-3 py-1 rounded-md">
                {formatTime(estimatedEndTime)}
              </span>
            </div>
          </div>
        )}

        {sessionStatus === "completed" && (
          <div className="bg-emerald-950/40 border border-emerald-800 p-8 rounded-2xl mb-8 shadow-xl text-center animate-in fade-in zoom-in duration-500">
            <h2 className="text-3xl font-bold text-emerald-400 mb-2">
              Missão Cumprida! 🎉
            </h2>
            <p className="text-slate-400 mb-6">
              Todas as atividades desta sessão foram finalizadas.
            </p>
            <button
              onClick={generateWhatsAppReport}
              className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 mx-auto"
            >
              <Copy className="w-6 h-6" /> COPIAR RELATÓRIO P/ WHATSAPP
            </button>
          </div>
        )}

        {isEditingMode && sessionStatus === "planning" ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-6">
            {activeSession.activities.map((act, index) => (
              <div
                key={act.id}
                className="bg-slate-900 border border-slate-700 p-5 rounded-2xl shadow-lg relative"
              >
                <div className="absolute top-4 right-4">
                  <button
                    onClick={() => deleteActivity(act.id)}
                    className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="pr-12 grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      Atividade {index + 1}
                    </label>
                    <input
                      type="text"
                      value={act.title}
                      onChange={(e) =>
                        updateActivityField(act.id, "title", e.target.value)
                      }
                      className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-amber-500 focus:outline-none font-bold text-lg"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      Duração (m)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={act.duration} 
                      onChange={(e) =>
                        updateActivityField(
                          act.id,
                          "duration",
                          parseInt(e.target.value) || 0,
                        )
                      }
                      className="w-full bg-slate-800 text-amber-400 px-4 py-2 rounded-lg border border-slate-600 focus:border-amber-500 focus:outline-none font-mono font-bold text-lg text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      <MapPin className="w-3 h-3" /> Local (Opcional)
                    </label>
                    <input
                      type="text"
                      value={act.location || ""}
                      onChange={(e) =>
                        updateActivityField(act.id, "location", e.target.value)
                      }
                      placeholder="Ex: Pátio APM"
                      className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-amber-500 focus:outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">
                      <User className="w-3 h-3" /> Responsável (Opcional)
                    </label>
                    <input
                      type="text"
                      value={act.responsible || ""}
                      onChange={(e) =>
                        updateActivityField(
                          act.id,
                          "responsible",
                          e.target.value,
                        )
                      }
                      placeholder="Ex: Cmt Pelotão"
                      className="w-full bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-600 focus:border-amber-500 focus:outline-none text-sm"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider flex items-center gap-2">
                    <AlignLeft className="w-4 h-4" /> Checklist / Exercícios
                  </label>
                  <div className="text-[10px] text-emerald-500/80 mb-2 font-mono flex flex-wrap items-center gap-2">
                    <span className="text-slate-400">
                      ⏱️ Formatos de tempo automáticos:
                    </span>
                    <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                      Minutos: 5'
                    </span>
                    <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                      Segundos: 30"
                    </span>
                    <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                      Ambos: 1'30"
                    </span>
                  </div>
                  <textarea
                    value={act.exercises.map((e) => e.text).join("\n")}
                    onChange={(e) =>
                      handleTextareaChange(act.id, e.target.value)
                    }
                    placeholder={`Exemplo Tarefa:\nRecolher documentação\n\nExemplo Exercício com tempo:\nPrancha - 1'30"\nPolichinelo - 45"`}
                    className="w-full h-32 bg-slate-950 text-slate-300 p-3 rounded-lg border border-slate-700 focus:border-amber-500 focus:outline-none font-mono text-sm resize-y leading-relaxed"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 border-t border-slate-800 pt-4">
                  <div className="flex-1 flex gap-2 relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <input
                      list="exercise-datalist"
                      value={exerciseInputs[act.id] || ""}
                      onChange={(e) =>
                        setExerciseInputs({
                          ...exerciseInputs,
                          [act.id]: e.target.value,
                        })
                      }
                      placeholder="Buscar tarefa salva..."
                      className="flex-1 bg-slate-950 text-slate-300 pl-9 pr-3 py-2 rounded border border-slate-700 focus:border-emerald-500 text-sm focus:outline-none"
                    />
                    <button
                      onClick={() =>
                        appendExerciseWithDefaultTime(
                          act.id,
                          exerciseInputs[act.id],
                          (val) =>
                            setExerciseInputs({
                              ...exerciseInputs,
                              [act.id]: val,
                            }),
                        )
                      }
                      className="bg-slate-800 hover:bg-emerald-600 text-white px-4 py-2 rounded transition-colors text-sm font-bold uppercase"
                    >
                      Incluir
                    </button>
                  </div>
                  <div className="flex-1 flex gap-2 relative">
                    <Layers className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                    <select
                      value={blockSelects[act.id] || ""}
                      onChange={(e) =>
                        setBlockSelects({
                          ...blockSelects,
                          [act.id]: e.target.value,
                        })
                      }
                      className="flex-1 bg-slate-950 text-slate-300 pl-9 pr-3 py-2 rounded border border-slate-700 focus:border-emerald-500 text-sm focus:outline-none appearance-none truncate"
                    >
                      <option value="">Clonar bloco...</option>
                      {allBlocks.map((b) => (
                        <option key={b.id} value={b.text}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!blockSelects[act.id]) return;
                        appendTextToActivity(act.id, blockSelects[act.id]);
                        setBlockSelects({ ...blockSelects, [act.id]: "" });
                      }}
                      className="bg-slate-800 hover:bg-emerald-600 text-white px-4 py-2 rounded transition-colors text-sm font-bold uppercase"
                    >
                      Clonar
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addNewActivity}
              className="w-full bg-slate-800 hover:bg-slate-700 border-2 border-dashed border-slate-600 text-slate-400 py-4 rounded-xl font-bold flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" /> ADICIONAR NOVA ATIVIDADE
            </button>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {sessionStatus === "planning" && (
              <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl mb-6 shadow-lg flex flex-col sm:flex-row gap-6 justify-between items-center">
                <div className="w-full sm:w-auto">
                  <label className="block text-sm font-medium text-slate-400 mb-2">
                    Hora de Início da Sessão
                  </label>
                  <input
                    type="time"
                    value={`${plannedStartTime.getHours().toString().padStart(2, "0")}:${plannedStartTime.getMinutes().toString().padStart(2, "0")}`}
                    onChange={handleStartTimeChange}
                    className="bg-slate-800 text-white text-lg font-mono px-4 py-2 rounded-lg border border-slate-600 focus:border-emerald-500 focus:outline-none w-full sm:w-auto"
                  />
                </div>
                <button
                  onClick={() => startSession(activeSession)}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 sm:py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-lg sm:text-base"
                >
                  <Play className="w-5 h-5 fill-current" /> INICIAR SESSÃO
                </button>
              </div>
            )}

            {runningActivity && (
              <div
                className={`mb-8 p-6 rounded-2xl border-2 shadow-xl ${runningActivity.isDelayed ? "bg-red-950/40 border-red-800" : "bg-emerald-950/30 border-emerald-800"}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>{" "}
                    Em Curso
                  </span>
                  {runningActivity.isDelayed && (
                    <span className="text-red-400 text-xs font-bold flex items-center gap-1 bg-red-950 px-2 py-1 rounded-md border border-red-900">
                      <AlertTriangle className="w-4 h-4" /> ATRASADO
                    </span>
                  )}
                </div>

                <h2 className="text-3xl font-bold text-white mb-3">
                  {runningActivity.title}
                </h2>

                {(runningActivity.location || runningActivity.responsible) && (
                  <div className="flex flex-wrap gap-4 mb-6 text-sm text-slate-400">
                    {runningActivity.location && (
                      <span className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-700">
                        <MapPin size={14} className="text-emerald-500" />{" "}
                        {runningActivity.location}
                      </span>
                    )}
                    {runningActivity.responsible && (
                      <span className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-md border border-slate-700">
                        <User size={14} className="text-emerald-500" />{" "}
                        {runningActivity.responsible}
                      </span>
                    )}
                  </div>
                )}

                {(() => {
                  const elapsedMs =
                    now.getTime() - runningActivity.startTime.getTime();
                  const durationMs = runningActivity.duration * 60000;
                  const remainingMs = durationMs - elapsedMs;
                  const isOvertime = remainingMs < 0;
                  const absRemaining = Math.abs(remainingMs);

                  const formatMs = (ms) => {
                    const totalSeconds = Math.floor(ms / 1000);
                    const m = Math.floor(totalSeconds / 60);
                    const s = totalSeconds % 60;
                    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
                  };

                  let currentSumMs = 0;
                  let projectedExercise = null;
                  let projectedRemainingMs = 0;

                  const exercisesWithProjection = runningActivity.exercises.map(
                    (ex) => {
                      const exDurationMs = (ex.parsedSeconds || 0) * 1000;
                      const exStartMs = currentSumMs;
                      const exEndMs = currentSumMs + exDurationMs;
                      currentSumMs += exDurationMs;

                      const isProjectedActive =
                        !ex.cancelled &&
                        exDurationMs > 0 &&
                        elapsedMs >= exStartMs &&
                        elapsedMs < exEndMs;
                      if (isProjectedActive) {
                        projectedExercise = { ...ex, exStartMs };
                        projectedRemainingMs = exEndMs - elapsedMs;
                      }
                      return { ...ex, isProjectedActive, exStartMs };
                    },
                  );

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col items-center justify-center relative overflow-hidden">
                          {isOvertime && (
                            <div className="absolute top-0 w-full h-1 bg-red-500 animate-pulse"></div>
                          )}
                          <p className="text-xs text-slate-400 mb-1 uppercase tracking-wider">
                            {isOvertime
                              ? "Tempo Excedido (Geral)"
                              : "Tempo Restante (Geral)"}
                          </p>
                          <p
                            className={`text-6xl sm:text-5xl md:text-6xl font-mono font-bold tracking-tighter ${isOvertime ? "text-red-400" : "text-amber-400"}`}
                          >
                            {isOvertime ? "+" : ""}
                            {formatMs(absRemaining)}
                          </p>
                          <div className="mt-3 flex items-center gap-2 text-sm font-mono text-slate-500 bg-slate-950/50 px-3 py-1 rounded-md border border-slate-800">
                            <span>Decorrido:</span>
                            <span className="text-emerald-400">
                              {formatDuration(elapsedMs)}
                            </span>
                          </div>
                        </div>
                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex flex-col justify-center items-center">
                          <p className="text-xs text-slate-400 mb-3 uppercase tracking-wider">
                            Ajustar Tempo Global da Atividade
                          </p>
                          <div className="flex items-center gap-6">
                            <button
                              onClick={() =>
                                adjustCurrentDuration(runningActivity.id, -5)
                              }
                              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xl border border-slate-700 transition-colors"
                            >
                              -5
                            </button>
                            <div className="flex flex-col items-center min-w-[80px]">
                              <span className="text-4xl font-mono text-white leading-none">
                                {runningActivity.duration}
                              </span>
                              <span className="text-[10px] text-slate-500 uppercase mt-1">
                                Minutos
                              </span>
                              {runningActivity.duration !==
                                runningActivity.originalDuration && (
                                <span className="text-[10px] text-amber-500/80 font-mono mt-1 bg-amber-950/30 px-2 py-0.5 rounded">
                                  Previsto: {runningActivity.originalDuration}m
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() =>
                                adjustCurrentDuration(runningActivity.id, 5)
                              }
                              className="w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xl border border-slate-700 transition-colors"
                            >
                              +5
                            </button>
                          </div>
                        </div>
                      </div>

                      {projectedExercise && (
                        <div className="bg-blue-950/30 border border-blue-900/50 p-4 rounded-xl mb-6 shadow-inner animate-in fade-in duration-300">
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                              <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shrink-0" />
                              <div className="text-left">
                                <p className="text-[10px] text-blue-400 uppercase font-bold tracking-widest">
                                  Ponto de Situação (Atual)
                                </p>
                                <p className="text-lg font-bold text-blue-100 line-clamp-1">
                                  {projectedExercise.text.split("-")[0].trim()}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-slate-900/80 px-3 sm:px-4 py-2 rounded-lg border border-slate-700">
                              <button
                                onClick={() =>
                                  adjustExerciseTime(
                                    runningActivity.id,
                                    projectedExercise.id,
                                    -15,
                                  )
                                }
                                className="px-2 py-1 text-slate-500 hover:text-red-400 font-bold text-sm bg-slate-800 rounded transition-colors"
                                title="Retirar 15 segundos deste exercício"
                              >
                                -15s
                              </button>
                              <div className="flex flex-col items-center min-w-[60px] sm:min-w-[80px]">
                                <span className="font-mono text-2xl sm:text-3xl text-blue-400 font-bold leading-none">
                                  {formatMs(projectedRemainingMs)}
                                </span>
                              </div>
                              <button
                                onClick={() =>
                                  adjustExerciseTime(
                                    runningActivity.id,
                                    projectedExercise.id,
                                    15,
                                  )
                                }
                                className="px-2 py-1 text-slate-500 hover:text-emerald-400 font-bold text-sm bg-slate-800 rounded transition-colors"
                                title="Adicionar 15 segundos a este exercício"
                              >
                                +15s
                              </button>
                              <div className="hidden sm:block w-px h-6 bg-slate-700 mx-1"></div>
                              <button
                                onClick={() =>
                                  finishExerciseEarly(
                                    runningActivity.id,
                                    projectedExercise.id,
                                    elapsedMs - projectedExercise.exStartMs,
                                  )
                                }
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm rounded transition-colors flex items-center gap-1 uppercase tracking-wider"
                                title="Encerrar exercício atual e pular para o próximo"
                              >
                                <SkipForward className="w-4 h-4" />{" "}
                                <span className="hidden sm:inline">Pular</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {exercisesWithProjection.filter(
                        (e) => e.text.trim() !== "",
                      ).length > 0 && (
                        <div className="mb-6 bg-slate-900/60 rounded-xl border border-slate-700/50 overflow-hidden">
                          <div className="bg-slate-800/50 p-3 border-b border-slate-700/50 flex items-center gap-2">
                            <ListTodo className="w-4 h-4 text-emerald-400" />
                            <h4 className="text-sm text-slate-300 font-bold uppercase tracking-wider">
                              Checklist de Sub-Tarefas / Exercícios
                            </h4>
                          </div>
                          <div className="p-2 space-y-1">
                            {exercisesWithProjection
                              .filter((e) => e.text.trim() !== "")
                              .map((ex, idx) => (
                                <div
                                  key={ex.id}
                                  className={`flex flex-col p-3 rounded-lg transition-colors ${ex.completed ? "bg-emerald-900/10" : ex.isProjectedActive ? "bg-blue-900/20 border border-blue-900/50" : "hover:bg-slate-800"}`}
                                >
                                  <div className="flex items-start justify-between gap-2 w-full">
                                    <div
                                      className="flex items-start gap-3 overflow-hidden flex-1 cursor-pointer"
                                      onClick={() =>
                                        toggleExerciseTimeline(
                                          runningActivity.id,
                                          ex.id,
                                        )
                                      }
                                    >
                                      <input
                                        type="checkbox"
                                        checked={ex.completed}
                                        readOnly
                                        className="w-6 h-6 rounded border-slate-600 bg-slate-800 shrink-0 mt-0.5 pointer-events-none"
                                      />
                                      <div className="flex flex-col w-full">
                                        <span
                                          className={`text-lg truncate ${ex.completed || ex.cancelled ? "line-through text-slate-500" : ex.isProjectedActive ? "text-blue-200 font-bold" : "text-slate-200"}`}
                                        >
                                          {idx + 1}. {ex.text}
                                        </span>
                                        {(ex.parsedSeconds > 0 ||
                                          ex.originalParsedSeconds > 0 ||
                                          ex.cancelled) && (
                                          <span
                                            className={`text-[10px] mt-0.5 font-mono ${ex.parsedSeconds !== ex.originalParsedSeconds && !ex.cancelled ? "text-amber-500" : "text-slate-500"}`}
                                          >
                                            ⏱️ Duração:{" "}
                                            {formatSecsToMinSec(
                                              ex.parsedSeconds,
                                            )}
                                            {ex.parsedSeconds !==
                                              ex.originalParsedSeconds &&
                                              !ex.cancelled &&
                                              ` (Previsto: ${formatSecsToMinSec(ex.originalParsedSeconds)})`}
                                            {ex.cancelled && ` (Cancelado)`}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0 ml-2 bg-slate-900/50 rounded-lg p-1 border border-slate-700/50">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveExercise(
                                            runningActivity.id,
                                            idx,
                                            -1,
                                          );
                                        }}
                                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                        title="Mover para cima"
                                      >
                                        <ArrowUp size={16} />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          moveExercise(
                                            runningActivity.id,
                                            idx,
                                            1,
                                          );
                                        }}
                                        className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors"
                                        title="Mover para baixo"
                                      >
                                        <ArrowDown size={16} />
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          cancelExercise(
                                            runningActivity.id,
                                            ex.id,
                                          );
                                        }}
                                        className={`p-1.5 rounded transition-colors ${ex.cancelled ? "text-amber-500 hover:bg-amber-900/50" : "text-slate-500 hover:text-red-400 hover:bg-red-900/50"}`}
                                        title={
                                          ex.cancelled
                                            ? "Restaurar exercício"
                                            : "Cancelar/riscar exercício"
                                        }
                                      >
                                        {ex.cancelled ? (
                                          <RotateCcw size={16} />
                                        ) : (
                                          <Trash2 size={16} />
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  {ex.isProjectedActive && (
                                    <div className="flex items-center gap-2 shrink-0 animate-pulse text-blue-400 bg-blue-950 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-widest border border-blue-900/50 mt-2 self-start ml-9">
                                      <span className="hidden sm:inline">
                                        A Decorrer
                                      </span>{" "}
                                      <PlayCircle className="w-4 h-4 fill-current" />
                                    </div>
                                  )}
                                </div>
                              ))}
                          </div>

                          <div className="p-3 bg-slate-800/50 border-t border-slate-700/50 flex gap-2 items-center">
                            <input
                              type="text"
                              value={quickAddText}
                              onChange={(e) => setQuickAddText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter")
                                  appendExerciseWithDefaultTime(
                                    runningActivity.id,
                                    quickAddText,
                                    setQuickAddText,
                                  );
                              }}
                              placeholder="Incluir novo na fila (ex: Prancha)"
                              className="flex-1 bg-slate-900 text-slate-200 px-3 py-2 rounded border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm font-mono"
                            />
                            <button
                              onClick={() =>
                                appendExerciseWithDefaultTime(
                                  runningActivity.id,
                                  quickAddText,
                                  setQuickAddText,
                                )
                              }
                              className="bg-slate-700 hover:bg-emerald-600 text-white px-3 py-2 rounded transition-colors"
                              title="Incluir exercício na lista atual"
                            >
                              <Plus size={18} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                <button
                  onClick={() => nextActivity(runningActivity.id)}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2"
                >
                  <CheckSquare className="w-6 h-6" /> CONCLUIR E AVANÇAR
                </button>
              </div>
            )}

            <div className="space-y-3 mb-8">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">
                Cronograma Geral
              </h3>

              {computedActivities.map((act, index) => {
                const isCompleted = act.status === "completed";
                const isRunning = act.status === "running";
                return (
                  <div
                    key={act.id}
                    className={`flex flex-col p-3 sm:p-4 rounded-xl border transition-all ${isCompleted ? "bg-slate-900 border-slate-800 opacity-60" : isRunning ? "hidden" : "bg-slate-800/50 border-slate-700"}`}
                  >
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3">
                        <div className="flex items-center sm:w-44 shrink-0 mt-1 sm:mt-0">
                          {isCompleted ? (
                            <CheckSquare className="w-5 h-5 text-emerald-500 mr-2 shrink-0" />
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 border-slate-600 mr-2 shrink-0"></div>
                          )}
                          <div className="flex flex-col">
                            <div className="font-mono text-sm flex flex-wrap items-center">
                              <span
                                className={
                                  isCompleted
                                    ? "text-slate-400"
                                    : "text-slate-200"
                                }
                              >
                                {formatTime(act.computedStart)}
                              </span>
                              <span className="text-slate-500 mx-1">-</span>
                              <span
                                className={
                                  act.isDelayed
                                    ? "text-red-400 font-bold"
                                    : isCompleted
                                      ? "text-slate-400"
                                      : "text-slate-200"
                                }
                              >
                                {formatTime(act.computedEnd)}
                              </span>
                            </div>
                            {sessionStatus !== "planning" &&
                              act.originalStartTime && (
                                <div className="font-mono text-[10px] flex flex-wrap text-amber-500/70 mt-0.5 items-center">
                                  <span>
                                    {formatTime(act.originalStartTime)}
                                  </span>
                                  <span className="mx-1">-</span>
                                  <span>{formatTime(act.originalEndTime)}</span>
                                  <span className="ml-1 uppercase tracking-wider text-[8px] bg-amber-950/50 px-1 rounded">
                                    Previsto
                                  </span>
                                </div>
                              )}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span
                            onClick={() => {
                              if (!isCompleted && !isRunning)
                                renameActivityOnTheFly(act.id, act.title);
                            }}
                            className={`font-medium text-lg ${isCompleted ? "text-slate-400 line-through" : "text-white"} ${!isCompleted && !isRunning ? "cursor-pointer hover:text-emerald-400 border-b border-dashed border-transparent hover:border-emerald-400" : ""}`}
                            title={
                              !isCompleted && !isRunning
                                ? "Clique para renomear esta atividade"
                                : ""
                            }
                          >
                            {act.title}
                          </span>

                          {(act.location || act.responsible) && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {act.location && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-700/50">
                                  <MapPin
                                    size={10}
                                    className="text-emerald-500"
                                  />{" "}
                                  {act.location}
                                </span>
                              )}
                              {act.responsible && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900/50 px-1.5 py-0.5 rounded border border-slate-700/50">
                                  <User
                                    size={10}
                                    className="text-emerald-500"
                                  />{" "}
                                  {act.responsible}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-end">
                        {sessionStatus === "running" &&
                        !isCompleted &&
                        !isRunning ? (
                          <div className="flex flex-col items-end gap-2">
                            <div className="flex items-center gap-2">
                              <div className="flex items-center bg-slate-900/50 rounded-lg p-1 border border-slate-700/50">
                                <button
                                  onClick={() => moveActivity(index, -1)}
                                  disabled={
                                    index === 0 ||
                                    computedActivities[index - 1].status !==
                                      "pending"
                                  }
                                  className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Mover para cima"
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  onClick={() => moveActivity(index, 1)}
                                  disabled={
                                    index === computedActivities.length - 1
                                  }
                                  className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Mover para baixo"
                                >
                                  <ArrowDown size={14} />
                                </button>
                                <button
                                  onClick={() => deleteActivity(act.id)}
                                  className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-900/50 rounded transition-colors"
                                  title="Remover atividade"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-700">
                                <button
                                  onClick={() =>
                                    adjustCurrentDuration(act.id, -1)
                                  }
                                  className="px-2 py-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded font-bold"
                                >
                                  -
                                </button>
                                <span
                                  className={`w-8 text-center font-mono font-bold text-sm ${act.duration !== act.originalDuration ? "text-amber-400" : "text-emerald-400"}`}
                                >
                                  {act.duration}
                                </span>
                                <button
                                  onClick={() =>
                                    adjustCurrentDuration(act.id, 1)
                                  }
                                  className="px-2 py-1 text-slate-500 hover:text-white hover:bg-slate-800 rounded font-bold"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mt-0.5">
                              {act.duration !== act.originalDuration && (
                                <span className="text-[10px] text-amber-500/80 font-mono pr-1">
                                  Previsto: {act.originalDuration}m
                                </span>
                              )}
                              <button
                                onClick={() => jumpToActivity(act.id)}
                                className="flex items-center gap-1 text-[10px] bg-amber-900/50 hover:bg-amber-600 text-amber-400 hover:text-white px-2 py-1 rounded transition-colors uppercase font-bold text-right"
                                title="Avançar o cronómetro diretamente para esta atividade"
                              >
                                <FastForward className="w-3 h-3" /> Pular p/ cá
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <span className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-700 text-slate-400 font-mono text-sm">
                              {act.duration} min
                            </span>
                            {sessionStatus === "planning" && index > 0 && (
                              <button
                                onClick={() =>
                                  startSession(activeSession, index)
                                }
                                className="mt-1 flex items-center gap-1 text-[10px] bg-emerald-900/50 hover:bg-emerald-600 text-emerald-400 hover:text-white px-2 py-1 rounded transition-colors uppercase font-bold text-right"
                                title="Marcar anteriores como concluídas e iniciar a sessão daqui"
                              >
                                <Play className="w-3 h-3" /> Iniciar Daqui
                              </button>
                            )}
                            {sessionStatus === "running" &&
                              act.duration !== act.originalDuration && (
                                <span className="text-[10px] text-amber-500/80 font-mono pr-1">
                                  Previsto: {act.originalDuration}m
                                </span>
                              )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {sessionStatus !== "completed" && (
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-xl flex gap-2 items-center mt-4 shadow-sm animate-in fade-in">
                  <input
                    type="text"
                    value={quickAddActivityText}
                    onChange={(e) => setQuickAddActivityText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        quickAddActivity(quickAddActivityText);
                    }}
                    placeholder="Incluir nova atividade na fila (ex: Reunião extra)"
                    className="flex-1 bg-slate-900 text-slate-200 px-3 py-2 rounded border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm font-mono"
                  />
                  <button
                    onClick={() => quickAddActivity(quickAddActivityText)}
                    className="bg-slate-700 hover:bg-emerald-600 text-white px-3 py-2 rounded transition-colors flex items-center gap-1 text-sm font-bold uppercase"
                    title="Adicionar ao final da fila"
                  >
                    <Plus size={18} />{" "}
                    <span className="hidden sm:inline">Adicionar</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
