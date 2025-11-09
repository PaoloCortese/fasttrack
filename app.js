const { useState, useEffect } = React;
const { Clock, Calendar, TrendingDown, Droplet, Apple, Play, Square, CheckCircle, Circle } = lucide;
const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = Recharts;

const FastTrack = () => {
  const [fastingState, setFastingState] = useState(null);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [currentWeight, setCurrentWeight] = useState(75);
  const [weightHistory, setWeightHistory] = useState([
    { week: 'Sett 1', weight: 75, date: '2024-11-03' },
  ]);
  const [fastingHistory, setFastingHistory] = useState([]);
  const [showWeightInput, setShowWeightInput] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [selectedView, setSelectedView] = useState('dashboard');
  const [demoMode, setDemoMode] = useState(false);

  const [showHydrationModal, setShowHydrationModal] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showCheatModal, setShowCheatModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dailyHydration, setDailyHydration] = useState(0);
  const [selectedFoods, setSelectedFoods] = useState({});
  const [customFoods, setCustomFoods] = useState({
    proteins: '',
    vegetables: '',
    fats: '',
    carbs: '',
    fruits: ''
  });
  const [foodLists, setFoodLists] = useState({
    proteins: ['Pollo', 'Pesce', 'Uova', 'Legumi', 'Tofu'],
    vegetables: ['Pomodori', 'Melanzane', 'Carote', 'Peperoni', 'Zucchine'],
    fats: ['Avocado', 'Noci', 'Olio d\'oliva', 'Semi', 'Mandorle'],
    carbs: ['Riso integrale', 'Pasta integrale', 'Patate', 'Avena', 'Pane integrale'],
    fruits: ['Mele', 'Banane', 'Frutti di bosco', 'Arance', 'Kiwi']
  });
  const [cheatMeals, setCheatMeals] = useState([]);
  const [cheatType, setCheatType] = useState('dolce');
  const [cheatDescription, setCheatDescription] = useState('');
  const [dailyTracking, setDailyTracking] = useState({});

  const phases = [
    {
      id: 1,
      name: 'Fase 1: Digestione',
      hours: '0-4 ore',
      description: 'Il corpo usa il glucosio nel sangue come energia principale. Digestione in corso.',
      benefits: ['Utilizzo glucosio', 'Insulina elevata', 'Digestione attiva'],
      color: 'from-blue-400 to-blue-500'
    },
    {
      id: 2,
      name: 'Fase 2: Transizione',
      hours: '4-8 ore',
      description: 'I livelli di insulina scendono. Il corpo esaurisce il glicogeno epatico.',
      benefits: ['Insulina in calo', 'Esaurimento glicogeno', 'Inizio transizione'],
      color: 'from-purple-400 to-purple-500'
    },
    {
      id: 3,
      name: 'Fase 3: Chetosi Iniziale',
      hours: '8-12 ore',
      description: 'Inizia la produzione di chetoni. Il corpo brucia grassi. Autofagia attiva.',
      benefits: ['Chetosi lieve', 'Combustione grassi', 'Autofagia inizia'],
      color: 'from-orange-400 to-orange-500'
    },
    {
      id: 4,
      name: 'Fase 4: Massima Efficienza',
      hours: '12-16 ore',
      description: 'Picco di chetosi e autofagia. Massima ossidazione dei grassi. Benefici ottimali.',
      benefits: ['Chetosi pronunciata', 'HGH aumentato', 'BDNF attivo', 'Massimo beneficio'],
      color: 'from-green-400 to-green-500'
    }
  ];

  const foodCategories = {
    proteins: { name: 'Proteine', icon: '🥩' },
    vegetables: { name: 'Verdure', icon: '🥬' },
    fats: { name: 'Grassi Sani', icon: '🥑' },
    carbs: { name: 'Carboidrati', icon: '🌾' },
    fruits: { name: 'Frutta', icon: '🍎' }
  };

  const tips = [
    {
      phase: 0,
      hydration: 'Bevi acqua regolarmente. Tè e caffè senza zucchero sono permessi.',
      nutrition: 'Durante le 8 ore di alimentazione, concentrati su proteine magre, verdure, grassi sani e carboidrati complessi.'
    },
    {
      phase: 1,
      hydration: 'Mantieni l\'idratazione costante. Acqua, tè verde o caffè nero ti aiuteranno.',
      nutrition: 'Prepara pasti bilanciati per la tua finestra alimentare. Evita zuccheri raffinati.'
    },
    {
      phase: 2,
      hydration: 'Bevi acqua abbondante. Potresti sentire un po\' di fame, l\'acqua aiuta.',
      nutrition: 'Quando riapri la finestra alimentare, inizia con cibi facilmente digeribili.'
    },
    {
      phase: 3,
      hydration: 'Ottimo lavoro! Continua a idratarti. Brodo vegetale è un\'ottima opzione.',
      nutrition: 'Sei in chetosi! Il corpo sta bruciando grassi. Mantieni l\'idratazione.'
    },
    {
      phase: 4,
      hydration: 'Fase finale! Acqua con limone può dare una spinta. Continua così!',
      nutrition: 'Massimi benefici raggiunti! Quando mangerai, scegli cibi nutrienti e non abbuffarti.'
    }
  ];

  useEffect(() => {
    const saved = localStorage.getItem('fastTrackData');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.fastingState) setFastingState(data.fastingState);
      if (data.currentWeight) setCurrentWeight(data.currentWeight);
      if (data.weightHistory) setWeightHistory(data.weightHistory);
      if (data.fastingHistory) setFastingHistory(data.fastingHistory);
      if (data.dailyTracking) setDailyTracking(data.dailyTracking);
      if (data.selectedFoods) setSelectedFoods(data.selectedFoods);
      if (data.customFoods) setCustomFoods(data.customFoods);
      if (data.cheatMeals) setCheatMeals(data.cheatMeals);
      if (data.foodLists) setFoodLists(data.foodLists);
    }

    const today = new Date().toISOString().split('T')[0];
    const todayData = JSON.parse(localStorage.getItem('fastTrackData') || '{}');
    if (todayData.dailyTracking && todayData.dailyTracking[today]) {
      setDailyHydration(todayData.dailyTracking[today].hydration || 0);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('fastTrackData', JSON.stringify({
      fastingState,
      currentWeight,
      weightHistory,
      fastingHistory,
      dailyTracking,
      selectedFoods,
      customFoods,
      cheatMeals,
      foodLists
    }));
  }, [fastingState, currentWeight, weightHistory, fastingHistory, dailyTracking, selectedFoods, customFoods, cheatMeals, foodLists]);

  useEffect(() => {
    if (!fastingState) return;

    const interval = setInterval(() => {
      const speedMultiplier = demoMode ? 600 : 1;
      const elapsed = (Date.now() - fastingState.startTime) * speedMultiplier;
      const hours = elapsed / (1000 * 60 * 60);
      setTimeElapsed(elapsed);

      if (hours < 4) setCurrentPhase(1);
      else if (hours < 8) setCurrentPhase(2);
      else if (hours < 12) setCurrentPhase(3);
      else if (hours < 16) setCurrentPhase(4);
      else setCurrentPhase(5);
    }, 1000);

    return () => clearInterval(interval);
  }, [fastingState, demoMode]);

  const startFasting = () => {
    const now = Date.now();
    const end = now + (16 * 60 * 60 * 1000);
    setFastingState({ startTime: now, endTime: end });
    setCurrentPhase(1);
    setTimeElapsed(0);
  };

  const stopFasting = () => {
    if (fastingState && currentPhase === 5) {
      const newEntry = {
        date: new Date(fastingState.startTime).toISOString().split('T')[0],
        completed: true,
        duration: timeElapsed
      };
      setFastingHistory([...fastingHistory, newEntry]);
    }
    setFastingState(null);
    setCurrentPhase(0);
    setTimeElapsed(0);
  };

  const formatTime = (ms) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const updateWeight = () => {
    if (!newWeight || isNaN(newWeight)) return;

    const weight = parseFloat(newWeight);
    setCurrentWeight(weight);

    const weekNumber = weightHistory.length + 1;
    const newEntry = {
      week: `Sett ${weekNumber}`,
      weight: weight,
      date: new Date().toISOString().split('T')[0]
    };

    setWeightHistory([...weightHistory, newEntry]);
    setNewWeight('');
    setShowWeightInput(false);
  };

  const getWeightChange = () => {
    if (weightHistory.length < 2) return 0;
    return (currentWeight - weightHistory[0].weight).toFixed(1);
  };

  const getWeeklyChange = () => {
    if (weightHistory.length < 2) return 0;
    return (currentWeight - weightHistory[weightHistory.length - 2].weight).toFixed(1);
  };

  const getStreak = () => {
    return fastingHistory.filter(f => f.completed).length;
  };

  const getMonthDays = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const hasFasting = fastingHistory.some(f => f.date === dateStr && f.completed);
      const tracking = dailyTracking[dateStr] || {};
      days.push({
        day: i,
        date: dateStr,
        hasFasting,
        hydration: tracking.hydration || 0,
        nutrition: tracking.nutrition || false,
        cheat: tracking.cheat || false
      });
    }
    return days;
  };

  const updateHydration = (bottles) => {
    setDailyHydration(bottles);
    const today = new Date().toISOString().split('T')[0];
    setDailyTracking({
      ...dailyTracking,
      [today]: {
        ...dailyTracking[today],
        hydration: bottles
      }
    });
  };

  const saveNutrition = () => {
    const today = new Date().toISOString().split('T')[0];
    const hasSelectedFoods = Object.keys(selectedFoods).length > 0;
    setDailyTracking({
      ...dailyTracking,
      [today]: {
        ...dailyTracking[today],
        nutrition: hasSelectedFoods
      }
    });
    setShowNutritionModal(false);
  };

  const saveCheatMeal = () => {
    const today = new Date().toISOString().split('T')[0];
    const newCheat = {
      id: Date.now(),
      date: today,
      time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      type: cheatType,
      description: cheatDescription.trim() || `Sgarro ${cheatType}`
    };

    setCheatMeals([...cheatMeals, newCheat]);
    setDailyTracking({
      ...dailyTracking,
      [today]: {
        ...dailyTracking[today],
        cheat: true
      }
    });

    setCheatDescription('');
    setCheatType('dolce');
    setShowCheatModal(false);
  };

  const toggleFood = (category, food) => {
    const key = `${category}-${food}`;
    const newSelected = { ...selectedFoods };
    if (newSelected[key]) {
      delete newSelected[key];
    } else {
      newSelected[key] = { category, food, date: new Date().toISOString().split('T')[0] };
    }
    setSelectedFoods(newSelected);
  };

  const removeFood = (category, food) => {
    const newFoodLists = { ...foodLists };
    newFoodLists[category] = newFoodLists[category].filter(item => item !== food);
    setFoodLists(newFoodLists);

    const key = `${category}-${food}`;
    const newSelected = { ...selectedFoods };
    if (newSelected[key]) {
      delete newSelected[key];
      setSelectedFoods(newSelected);
    }
  };

  const addCustomFood = (category) => {
    const customFood = customFoods[category].trim();
    if (!customFood) return;

    const newFoodLists = { ...foodLists };
    if (!newFoodLists[category].includes(customFood)) {
      newFoodLists[category] = [...newFoodLists[category], customFood];
      setFoodLists(newFoodLists);
    }

    setCustomFoods({
      ...customFoods,
      [category]: ''
    });
  };

  const updateCustomFood = (category, value) => {
    setCustomFoods({
      ...customFoods,
      [category]: value
    });
  };

  const getTodayCheatCount = () => {
    const today = new Date().toISOString().split('T')[0];
    return cheatMeals.filter(c => c.date === today).length;
  };

  const openDayDetails = (day) => {
    if (!day) return;
    setSelectedDay(day);
    setShowDayModal(true);
  };

  const getDayWeight = (date) => {
    const weightsUntilDate = weightHistory
      .filter(w => w.date <= date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    return weightsUntilDate.length > 0 ? weightsUntilDate[0].weight : null;
  };

  const getDayFoods = (date) => {
    return Object.values(selectedFoods).filter(f => f.date === date);
  };

  const getDayCheats = (date) => {
    return cheatMeals.filter(c => c.date === date);
  };

  // Render functions continue in next part...
  return React.createElement('div', { className: 'min-h-screen bg-gradient-to-br from-gray-50 to-gray-100' },
    React.createElement('div', { className: 'max-w-4xl mx-auto p-4 pb-24' },
      React.createElement('div', { className: 'mb-6 pt-6' },
        React.createElement('div', { className: 'flex items-start justify-between' },
          React.createElement('div', null,
            React.createElement('h1', { className: 'text-3xl font-bold text-gray-900 mb-2' }, 'FastTrack 16/8'),
            React.createElement('p', { className: 'text-gray-600' }, 'Il tuo compagno per il digiuno intermittente')
          ),
          React.createElement('button', {
            onClick: () => setDemoMode(!demoMode),
            className: `px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              demoMode ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-gray-700 shadow-sm hover:shadow-md'
            }`
          }, demoMode ? '⚡ Demo Attiva' : 'Demo Mode')
        ),
        demoMode && React.createElement('div', { className: 'mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-900' },
          React.createElement('strong', null, 'Modalità Demo:'),
          ' 16 ore = 96 secondi (~1.6 minuti). Ogni secondo = 10 minuti di digiuno reale.'
        )
      ),
      // Dashboard content would continue here
      React.createElement('div', { className: 'text-center py-12' },
        React.createElement('p', { className: 'text-gray-600' }, 'App FastTrack caricata correttamente')
      )
    )
  );
};

// Render the app
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(FastTrack));
