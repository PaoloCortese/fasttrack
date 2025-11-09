const { useState, useEffect } = React;
const { Clock, Calendar, TrendingDown, Droplet, Apple, Play, Square, CheckCircle, Circle } = lucide;
const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = Recharts;


const FastTrack = () => {
  const [fastingState, setFastingState] = useState(null); // { startTime, endTime }
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
  const [demoMode, setDemoMode] = useState(false); // Modalità demo accelerata
  
  // Hydration & Nutrition tracking
  const [showHydrationModal, setShowHydrationModal] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [showCheatModal, setShowCheatModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dailyHydration, setDailyHydration] = useState(0); // bottiglie da 0.5L
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
  const [dailyTracking, setDailyTracking] = useState({}); // {date: {hydration: 4, nutrition: true, fasting: true, cheat: true}}

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
    proteins: {
      name: 'Proteine',
      icon: '🥩'
    },
    vegetables: {
      name: 'Verdure',
      icon: '🥬'
    },
    fats: {
      name: 'Grassi Sani',
      icon: '🥑'
    },
    carbs: {
      name: 'Carboidrati',
      icon: '🌾'
    },
    fruits: {
      name: 'Frutta',
      icon: '🍎'
    }
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
    // Load data from localStorage
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
    
    // Load today's hydration
    const today = new Date().toISOString().split('T')[0];
    const todayData = JSON.parse(localStorage.getItem('fastTrackData') || '{}');
    if (todayData.dailyTracking && todayData.dailyTracking[today]) {
      setDailyHydration(todayData.dailyTracking[today].hydration || 0);
    }
  }, []);

  useEffect(() => {
    // Save data to localStorage
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
      // In modalità demo: 1 secondo reale = 10 minuti di digiuno
      // 16 ore = 960 minuti = 96 secondi in demo mode
      const speedMultiplier = demoMode ? 600 : 1; // 600 = 10 minuti al secondo
      const elapsed = (Date.now() - fastingState.startTime) * speedMultiplier;
      const hours = elapsed / (1000 * 60 * 60);
      setTimeElapsed(elapsed);

      if (hours < 4) setCurrentPhase(1);
      else if (hours < 8) setCurrentPhase(2);
      else if (hours < 12) setCurrentPhase(3);
      else if (hours < 16) setCurrentPhase(4);
      else {
        // Digiuno completato
        setCurrentPhase(5);
      }
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
      // Salva nel calendario solo se completato
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
    // Remove from food lists
    const newFoodLists = { ...foodLists };
    newFoodLists[category] = newFoodLists[category].filter(item => item !== food);
    setFoodLists(newFoodLists);
    
    // Remove from selected foods if exists
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
    
    // Add to food lists
    const newFoodLists = { ...foodLists };
    if (!newFoodLists[category].includes(customFood)) {
      newFoodLists[category] = [...newFoodLists[category], customFood];
      setFoodLists(newFoodLists);
    }
    
    // Clear input
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
    // Trova l'ultimo peso registrato fino a questa data
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

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Header con peso */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm text-gray-600 mb-1">Peso Attuale</div>
            <div className="text-4xl font-semibold text-gray-900">{currentWeight} kg</div>
            <div className="text-sm text-gray-600 mt-2">
              Totale: <span className={getWeightChange() < 0 ? 'text-green-600 font-medium' : 'text-gray-900'}>{getWeightChange()} kg</span>
              {weightHistory.length > 1 && (
                <> • Settimana: <span className={getWeeklyChange() < 0 ? 'text-green-600 font-medium' : 'text-gray-900'}>{getWeeklyChange()} kg</span></>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowWeightInput(!showWeightInput)}
            className="bg-white px-4 py-2 rounded-xl text-sm font-medium text-gray-700 shadow-sm hover:shadow-md transition-all"
          >
            Aggiorna Peso
          </button>
        </div>
        
        {showWeightInput && (
          <div className="flex gap-2 mt-4">
            <input
              type="number"
              step="0.1"
              value={newWeight}
              onChange={(e) => setNewWeight(e.target.value)}
              placeholder="Nuovo peso"
              className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={updateWeight}
              className="bg-blue-500 text-white px-6 py-2 rounded-xl font-medium hover:bg-blue-600 transition-colors"
            >
              Salva
            </button>
          </div>
        )}
      </div>

      {/* Stato digiuno */}
      <div className="bg-white rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-blue-500" />
            <h2 className="text-xl font-semibold text-gray-900">Digiuno 16/8</h2>
          </div>
          <div className="text-sm text-gray-600">
            Streak: {getStreak()} giorni
          </div>
        </div>

        {!fastingState ? (
          <div className="text-center py-8">
            <div className="text-gray-600 mb-6">Pronto per iniziare il tuo digiuno?</div>
            <button
              onClick={startFasting}
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-4 rounded-2xl font-medium hover:shadow-lg transition-all inline-flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Inizia Digiuno
            </button>
          </div>
        ) : (
          <div>
            <div className="text-center mb-6">
              <div className="text-5xl font-bold text-gray-900 mb-2">{formatTime(timeElapsed)}</div>
              <div className="text-gray-600 mb-1">
                {currentPhase < 5 ? `Fase ${currentPhase} di 4` : 'Digiuno Completato! 🎉'}
              </div>
              <div className="text-xs text-blue-600 font-semibold flex items-center justify-center gap-3">
                <span>Inizio: {new Date(fastingState.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>•</span>
                <span>Fine: {new Date(fastingState.endTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="relative h-3 bg-gray-100 rounded-full mb-6 overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min((timeElapsed / (16 * 60 * 60 * 1000)) * 100, 100)}%` }}
              />
            </div>

            {/* Fasi */}
            <div className="space-y-3 mb-6">
              {phases.map((phase, idx) => (
                <div
                  key={phase.id}
                  className={`p-4 rounded-2xl transition-all ${
                    currentPhase === phase.id
                      ? `bg-gradient-to-r ${phase.color} text-white shadow-lg scale-105`
                      : currentPhase > phase.id
                      ? 'bg-green-50 border border-green-200'
                      : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="font-semibold mb-1">{phase.name}</div>
                      <div className={`text-sm mb-2 ${currentPhase === phase.id ? 'text-white/90' : 'text-gray-600'}`}>
                        {phase.hours} • {phase.description}
                      </div>
                    </div>
                    {currentPhase > phase.id ? (
                      <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                    ) : currentPhase === phase.id ? (
                      <Circle className="w-6 h-6 animate-pulse flex-shrink-0" />
                    ) : (
                      <Circle className="w-6 h-6 text-gray-300 flex-shrink-0" />
                    )}
                  </div>
                  {currentPhase === phase.id && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {phase.benefits.map((benefit, i) => (
                        <span key={i} className="text-xs px-3 py-1 bg-white/20 rounded-full">
                          {benefit}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={stopFasting}
              className="w-full bg-gray-900 text-white px-6 py-4 rounded-2xl font-medium hover:bg-gray-800 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Square className="w-5 h-5" />
              {currentPhase === 5 ? 'Completa Digiuno' : 'Interrompi Digiuno'}
            </button>
          </div>
        )}
      </div>

      {/* Consigli */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          onClick={() => setShowHydrationModal(true)}
          className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-6 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Droplet className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-gray-900">Idratazione</h3>
            </div>
            <div className="text-sm font-medium text-blue-600">
              {dailyHydration * 0.5}L / 2L
            </div>
          </div>
          <p className="text-sm text-gray-700">{tips[currentPhase]?.hydration || tips[0].hydration}</p>
        </button>
        <button
          onClick={() => setShowNutritionModal(true)}
          className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 hover:shadow-md transition-all text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Apple className="w-5 h-5 text-green-500" />
              <h3 className="font-semibold text-gray-900">Nutrizione</h3>
            </div>
            <div className="text-sm font-medium text-green-600">
              {Object.keys(selectedFoods).length} alimenti
            </div>
          </div>
          <p className="text-sm text-gray-700">{tips[currentPhase]?.nutrition || tips[0].nutrition}</p>
        </button>
      </div>

      {/* Sgarro Alimentare */}
      <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 mb-1">Sgarro Alimentare</h3>
            <p className="text-sm text-gray-600">
              {getTodayCheatCount() === 0 
                ? 'Nessuno sgarro oggi! Stai andando alla grande! 💪' 
                : `${getTodayCheatCount()} sgarro${getTodayCheatCount() > 1 ? 'i' : ''} oggi`}
            </p>
          </div>
          <button
            onClick={() => setShowCheatModal(true)}
            className="bg-orange-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors shadow-md"
          >
            Registra Sgarro
          </button>
        </div>
        {getTodayCheatCount() > 0 && (
          <div className="mt-3 space-y-2">
            {cheatMeals.filter(c => c.date === new Date().toISOString().split('T')[0]).map((cheat) => (
              <div key={cheat.id} className="bg-white/60 rounded-xl p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🍕</span>
                  <span className="font-medium text-gray-900 capitalize">{cheat.type}</span>
                  <span className="text-gray-500">• {cheat.time}</span>
                </div>
                <div className="text-gray-700 pl-7">{cheat.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderWeight = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <TrendingDown className="w-6 h-6 text-green-500" />
          <h2 className="text-xl font-semibold text-gray-900">Progressi Peso</h2>
        </div>

        <div className="h-64 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weightHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="week" stroke="#666" />
              <YAxis stroke="#666" domain={['auto', 'auto']} />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
              <Line 
                type="monotone" 
                dataKey="weight" 
                stroke="#3b82f6" 
                strokeWidth={3}
                dot={{ fill: '#3b82f6', r: 5 }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-2xl p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Peso Iniziale</div>
            <div className="text-2xl font-semibold text-gray-900">{weightHistory[0]?.weight} kg</div>
          </div>
          <div className="bg-purple-50 rounded-2xl p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Peso Attuale</div>
            <div className="text-2xl font-semibold text-gray-900">{currentWeight} kg</div>
          </div>
          <div className="bg-green-50 rounded-2xl p-4 text-center">
            <div className="text-sm text-gray-600 mb-1">Variazione</div>
            <div className={`text-2xl font-semibold ${getWeightChange() < 0 ? 'text-green-600' : 'text-gray-900'}`}>
              {getWeightChange()} kg
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCalendar = () => {
    const monthDays = getMonthDays();
    const today = new Date();
    const monthName = today.toLocaleString('it-IT', { month: 'long', year: 'numeric' });
    
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <Calendar className="w-6 h-6 text-purple-500" />
            <h2 className="text-xl font-semibold text-gray-900 capitalize">{monthName}</h2>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-gray-600 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((day, idx) => (
              <button
                key={idx}
                onClick={() => day && openDayDetails(day)}
                disabled={!day}
                className={`aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-all ${
                  !day
                    ? 'cursor-default'
                    : day.hasFasting
                    ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-md hover:shadow-lg hover:scale-105 cursor-pointer'
                    : 'bg-gray-50 text-gray-900 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                {day && (
                  <>
                    <div className="mb-1">{day.day}</div>
                    <div className="flex gap-1">
                      {day.hydration >= 4 && <span className="text-xs">💧</span>}
                      {day.nutrition && <span className="text-xs">🍎</span>}
                      {day.cheat && <span className="text-xs">🍕</span>}
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-gradient-to-br from-green-400 to-emerald-500" />
              <span className="text-gray-700">Digiuno</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">💧</span>
              <span className="text-gray-700">Idratazione (2L+)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🍎</span>
              <span className="text-gray-700">Nutrizione</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg">🍕</span>
              <span className="text-gray-700">Sgarro</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="font-semibold text-gray-900 mb-3">Statistiche Mensili</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">Digiuni Completati</div>
                <div className="text-2xl font-semibold text-gray-900">{getStreak()}</div>
              </div>
              <div className="bg-purple-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">Tasso Successo</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {fastingHistory.length > 0 ? Math.round((getStreak() / fastingHistory.length) * 100) : 0}%
                </div>
              </div>
              <div className="bg-cyan-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">Giorni Idratazione</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {Object.values(dailyTracking).filter(d => d.hydration >= 4).length}
                </div>
              </div>
              <div className="bg-orange-50 rounded-xl p-4">
                <div className="text-sm text-gray-600 mb-1">Sgarri Totali</div>
                <div className="text-2xl font-semibold text-gray-900">{cheatMeals.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto p-4 pb-24">
        {/* Header */}
        <div className="mb-6 pt-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">FastTrack 16/8</h1>
              <p className="text-gray-600">Il tuo compagno per il digiuno intermittente</p>
            </div>
            <button
              onClick={() => setDemoMode(!demoMode)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                demoMode
                  ? 'bg-orange-500 text-white shadow-lg'
                  : 'bg-white text-gray-700 shadow-sm hover:shadow-md'
              }`}
            >
              {demoMode ? '⚡ Demo Attiva' : 'Demo Mode'}
            </button>
          </div>
          {demoMode && (
            <div className="mt-3 bg-orange-50 border border-orange-200 rounded-xl p-3 text-sm text-orange-900">
              <strong>Modalità Demo:</strong> 16 ore = 96 secondi (~1.6 minuti). Ogni secondo = 10 minuti di digiuno reale.
            </div>
          )}
        </div>

        {/* Content */}
        {selectedView === 'dashboard' && renderDashboard()}
        {selectedView === 'weight' && renderWeight()}
        {selectedView === 'calendar' && renderCalendar()}

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-4xl mx-auto px-4 py-3">
            <div className="flex justify-around">
              <button
                onClick={() => setSelectedView('dashboard')}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                  selectedView === 'dashboard'
                    ? 'text-blue-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Clock className="w-6 h-6" />
                <span className="text-xs font-medium">Dashboard</span>
              </button>
              <button
                onClick={() => setSelectedView('weight')}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                  selectedView === 'weight'
                    ? 'text-blue-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <TrendingDown className="w-6 h-6" />
                <span className="text-xs font-medium">Peso</span>
              </button>
              <button
                onClick={() => setSelectedView('calendar')}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                  selectedView === 'calendar'
                    ? 'text-blue-500'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Calendar className="w-6 h-6" />
                <span className="text-xs font-medium">Calendario</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hydration Modal */}
      {showHydrationModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Droplet className="w-6 h-6 text-blue-500" />
                <h3 className="text-xl font-semibold text-gray-900">Idratazione Giornaliera</h3>
              </div>
              <button
                onClick={() => setShowHydrationModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 text-center">
              <div className="text-5xl font-bold text-blue-600 mb-2">
                {dailyHydration * 0.5}L
              </div>
              <div className="text-sm text-gray-600">
                {dailyHydration >= 4 ? '🎉 Ottimo!' : `Obiettivo: 2L (${4 - dailyHydration} bottiglie)`}
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="text-sm font-medium text-gray-700 mb-2">Bottiglie da 0.5L</div>
              <div className="grid grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((num) => (
                  <button
                    key={num}
                    onClick={() => updateHydration(num)}
                    className={`aspect-square rounded-2xl flex flex-col items-center justify-center transition-all ${
                      dailyHydration >= num
                        ? 'bg-gradient-to-br from-blue-400 to-cyan-500 text-white shadow-lg'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                  >
                    <Droplet className="w-8 h-8 mb-1" />
                    <span className="text-xs font-medium">{num * 0.5}L</span>
                  </button>
                ))}
              </div>
            </div>

            {dailyHydration >= 4 && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900">
                <strong>Eccellente!</strong> Hai raggiunto l'obiettivo minimo di idratazione. Continua così!
              </div>
            )}

            <button
              onClick={() => setShowHydrationModal(false)}
              className="w-full mt-4 bg-blue-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-600 transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* Nutrition Modal */}
      {showNutritionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-xl my-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Apple className="w-6 h-6 text-green-500" />
                <h3 className="text-xl font-semibold text-gray-900">Piano Nutrizionale</h3>
              </div>
              <button
                onClick={() => setShowNutritionModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6 mb-6">
              {Object.entries(foodCategories).map(([key, category]) => (
                <div key={key} className="bg-gray-50 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-2xl">{category.icon}</span>
                    <h4 className="font-semibold text-gray-900">{category.name}</h4>
                    <span className="text-xs text-gray-500 ml-auto">{foodLists[key]?.length || 0} alimenti</span>
                  </div>
                  
                  <div className="space-y-2 mb-3">
                    {foodLists[key]?.map((item) => (
                      <label
                        key={item}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors group"
                      >
                        <input
                          type="checkbox"
                          checked={!!selectedFoods[`${key}-${item}`]}
                          onChange={() => toggleFood(key, item)}
                          className="w-5 h-5 text-green-500 rounded focus:ring-2 focus:ring-green-500"
                        />
                        <span className="text-sm text-gray-700 flex-1">{item}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeFood(key, item);
                          }}
                          className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-2 py-1"
                        >
                          ✕
                        </button>
                      </label>
                    ))}
                  </div>

                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Aggiungi alimenti personalizzati:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customFoods[key]}
                        onChange={(e) => updateCustomFood(key, e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomFood(key);
                          }
                        }}
                        placeholder="es. Salmone, Mandorle..."
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      <button
                        type="button"
                        onClick={() => addCustomFood(key)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowNutritionModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={saveNutrition}
                className="flex-1 bg-green-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-green-600 transition-colors"
              >
                Salva Piano
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Details Modal */}
      {showDayModal && selectedDay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-xl my-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {new Date(selectedDay.date).toLocaleDateString('it-IT', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long' 
                  })}
                </h3>
                <p className="text-sm text-gray-600 mt-1">Riepilogo Giornata</p>
              </div>
              <button
                onClick={() => setShowDayModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Digiuno */}
              <div className={`rounded-2xl p-4 ${selectedDay.hasFasting ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className={`w-5 h-5 ${selectedDay.hasFasting ? 'text-green-600' : 'text-gray-400'}`} />
                  <h4 className="font-semibold text-gray-900">Digiuno 16/8</h4>
                </div>
                <p className="text-sm text-gray-700">
                  {selectedDay.hasFasting ? '✅ Digiuno completato con successo!' : '❌ Digiuno non completato'}
                </p>
              </div>

              {/* Idratazione */}
              <div className={`rounded-2xl p-4 ${selectedDay.hydration >= 4 ? 'bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200' : 'bg-gray-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Droplet className={`w-5 h-5 ${selectedDay.hydration >= 4 ? 'text-blue-600' : 'text-gray-400'}`} />
                    <h4 className="font-semibold text-gray-900">Idratazione</h4>
                  </div>
                  <span className="text-lg font-bold text-blue-600">{selectedDay.hydration * 0.5}L / 2L</span>
                </div>
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3, 4].map((num) => (
                    <div
                      key={num}
                      className={`flex-1 h-2 rounded-full ${
                        selectedDay.hydration >= num ? 'bg-blue-500' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-sm text-gray-700 mt-2">
                  {selectedDay.hydration >= 4 
                    ? '💧 Ottimo! Obiettivo raggiunto' 
                    : `${(2 - selectedDay.hydration * 0.5).toFixed(1)}L rimanenti per obiettivo`}
                </p>
              </div>

              {/* Nutrizione */}
              <div className={`rounded-2xl p-4 ${selectedDay.nutrition ? 'bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Apple className={`w-5 h-5 ${selectedDay.nutrition ? 'text-green-600' : 'text-gray-400'}`} />
                  <h4 className="font-semibold text-gray-900">Nutrizione</h4>
                </div>
                {getDayFoods(selectedDay.date).length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {Object.entries(
                      getDayFoods(selectedDay.date).reduce((acc, food) => {
                        if (!acc[food.category]) acc[food.category] = [];
                        acc[food.category].push(food.food);
                        return acc;
                      }, {})
                    ).map(([category, foods]) => (
                      <div key={category} className="bg-white/60 rounded-lg p-2">
                        <div className="text-xs font-medium text-gray-600 mb-1 capitalize">
                          {foodCategories[category]?.icon} {foodCategories[category]?.name}
                        </div>
                        <div className="text-sm text-gray-900">{foods.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-700">Nessun alimento registrato</p>
                )}
              </div>

              {/* Sgarri */}
              <div className={`rounded-2xl p-4 ${selectedDay.cheat ? 'bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🍕</span>
                  <h4 className="font-semibold text-gray-900">Sgarri Alimentari</h4>
                </div>
                {getDayCheats(selectedDay.date).length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {getDayCheats(selectedDay.date).map((cheat) => (
                      <div key={cheat.id} className="bg-white/60 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 capitalize">{cheat.type}</span>
                          <span className="text-xs text-gray-500">• {cheat.time}</span>
                        </div>
                        <div className="text-sm text-gray-700">{cheat.description}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-700">✅ Nessuno sgarro registrato</p>
                )}
              </div>

              {/* Peso */}
              <div className="rounded-2xl p-4 bg-purple-50 border border-purple-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-purple-600" />
                    <h4 className="font-semibold text-gray-900">Peso</h4>
                  </div>
                  {getDayWeight(selectedDay.date) ? (
                    <span className="text-2xl font-bold text-purple-600">
                      {getDayWeight(selectedDay.date)} kg
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">Non registrato</span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowDayModal(false)}
              className="w-full mt-6 bg-gray-900 text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-800 transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* Cheat Meal Modal */}
      {showCheatModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🍕</span>
                <h3 className="text-xl font-semibold text-gray-900">Registra Sgarro</h3>
              </div>
              <button
                onClick={() => setShowCheatModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 text-sm text-orange-900">
              <strong>Non ti preoccupare!</strong> Uno sgarro occasionale non rovinerà i tuoi progressi. L'importante è tornare subito in pista! 💪
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Tipo di Sgarro</label>
                <div className="grid grid-cols-2 gap-2">
                  {['dolce', 'salato', 'bevanda', 'altro'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setCheatType(type)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        cheatType === type
                          ? 'bg-orange-500 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Descrizione (opzionale)</label>
                <textarea
                  value={cheatDescription}
                  onChange={(e) => setCheatDescription(e.target.value)}
                  placeholder="es. Pizza margherita, gelato al cioccolato..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                />
                <div className="text-xs text-gray-500 mt-1">Puoi lasciare vuoto se preferisci</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCheatModal(false)}
                className="flex-1 bg-gray-100 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={saveCheatMeal}
                className="flex-1 bg-orange-500 text-white px-6 py-3 rounded-xl font-medium hover:bg-orange-600 transition-colors"
              >
                Salva Sgarro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<FastTrack />);
