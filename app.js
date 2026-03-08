const {
  useState,
  useEffect,
  useRef
} = React;
window.onerror = function (m, s, l) {
  document.getElementById("root").innerHTML = '<div style="padding:40px;color:#f87171;font-family:monospace;background:#0f0f14;min-height:100vh"><h2>Error</h2><pre style="white-space:pre-wrap;color:#ccc;margin-top:12px">' + m + '\nLine: ' + l + '</pre></div>';
  return true;
};
const COL = "mcatquest";
async function loadFromCloud(p) {
  try {
    var tp = new Promise(function (_, rej) {
      setTimeout(function () {
        rej(new Error("timeout"));
      }, 8000);
    });
    var fp = db.collection(COL).doc(p).get().then(function (d) {
      if (d.exists) return d.data();
      return null;
    });
    return await Promise.race([fp, tp]);
  } catch (e) {
    return null;
  }
}
async function saveToCloud(p, d) {
  try {
    var tp = new Promise(function (_, rej) {
      setTimeout(function () {
        rej(new Error("timeout"));
      }, 8000);
    });
    await Promise.race([db.collection(COL).doc(p).set(d), tp]);
    return true;
  } catch (e) {
    return false;
  }
}
function getSavedPin() {
  try {
    return localStorage.getItem("mcat_pin") || "";
  } catch (e) {
    return "";
  }
}
function rememberPin(p) {
  try {
    localStorage.setItem("mcat_pin", p);
  } catch (e) {}
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
const ALL_TAGS = [...new Set(QS.flatMap(function (q) {
  return q.tags || [];
}))].sort();
function getTagCounts(data) {
  var m = {};
  QS.forEach(function (q) {
    (q.tags || []).forEach(function (t) {
      if (!m[t]) m[t] = {
        total: 0,
        seen: 0,
        correct: 0
      };
      m[t].total++;
      var s = data.questionStats[q.id];
      if (s) {
        m[t].seen += s.seen;
        m[t].correct += s.correct;
      }
    });
  });
  return m;
}
const BOX_INT = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30
};
function isDue(d, id) {
  var nr = d.questionStats[id] && d.questionStats[id].nextReview || 0;
  return nr === 0 || Date.now() >= nr;
}
function updateBox(d, id, ok) {
  var st = d.questionStats[id] || {
    box: 1
  };
  var nb = ok ? Math.min(st.box + 1, 5) : 1;
  return {
    box: nb,
    nextReview: Date.now() + BOX_INT[nb] * 86400000
  };
}
function getDueCount(d) {
  return QS.filter(function (q) {
    return isDue(d, q.id);
  }).length;
}
function computeStreak(d) {
  var last = d.lastStudyDate || "";
  var cur = d.currentStreak || 0;
  var today = todayStr();
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (last === today) return cur;
  if (last === yesterday) return cur;
  return 0;
}
function updateStreakForToday(d) {
  var today = todayStr();
  if (d.lastStudyDate === today) return {
    lastStudyDate: today,
    currentStreak: d.currentStreak || 1
  };
  var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  var ns = d.lastStudyDate === yesterday ? (d.currentStreak || 0) + 1 : 1;
  return {
    lastStudyDate: today,
    currentStreak: ns
  };
}
const MODES = {
  BLITZ: {
    name: "Blitz",
    icon: "\u26A1",
    desc: "30s per question",
    time: 30,
    timed: true
  },
  MARATHON: {
    name: "Marathon",
    icon: "\u{1F3C3}",
    desc: "No timer, deep learning",
    time: null
  },
  BOSS_BATTLE: {
    name: "Boss Battle",
    icon: "\u{1F479}",
    desc: "5 hard Qs, 3 lives",
    time: 45,
    timed: true
  },
  SPACED_REVIEW: {
    name: "Spaced Review",
    icon: "\u{1F9E0}",
    desc: "Due for review now",
    time: null,
    smart: true
  },
  HARD_QS: {
    name: "Hard Questions",
    icon: "\u{1F480}",
    desc: "Below 70% accuracy",
    time: null,
    smart: true
  },
  NEW_QS: {
    name: "New Questions",
    icon: "\u2728",
    desc: "Unseen questions",
    time: null,
    smart: true
  },
  WEAK_TOPICS: {
    name: "Weak Topics",
    icon: "\u{1F3AF}",
    desc: "Your lowest categories",
    time: null,
    smart: true
  },
  INTERLEAVED: {
    name: "Interleaved",
    icon: "\u{1F500}",
    desc: "Random mix, all topics",
    time: null,
    smart: true
  },
  TAG_PRACTICE: {
    name: "Practice by Tag",
    icon: "\u{1F3F7}\uFE0F",
    desc: "Hyper-specific concepts",
    time: null,
    smart: true
  },
  FLAGGED: {
    name: "Flagged Questions",
    icon: "\u{1F6A9}",
    desc: "Questions you flagged",
    time: null,
    smart: true
  },
  CARS_MODE: {
    name: "CARS Practice",
    icon: "\u{1F4D6}",
    desc: "Reading comprehension",
    time: null,
    smart: true
  },
  REVIEW: {
    name: "Review Missed",
    icon: "\u{1F4DD}",
    desc: "Recent mistakes",
    time: null,
    smart: true
  },
  BLIND_SPOTS: {
    name: "Blind Spots",
    icon: "\u{1F4A5}",
    desc: "Confident but wrong",
    time: null,
    smart: true
  },
  SECTION_SIM: {
    name: "Section Sim",
    icon: "\u{1F3AF}",
    desc: "20 Qs, 30 min, one MCAT section",
    time: null,
    smart: true
  }
};
function getTagTier(data, tag) {
  var tqs = QS.filter(function (q) {
    return (q.tags || []).indexOf(tag) >= 0;
  });
  var t1 = 0,
    t1m = 0,
    t2 = 0,
    t2m = 0,
    t3 = 0,
    t3m = 0;
  tqs.forEach(function (q) {
    var s = data.questionStats[q.id];
    var acc = s && s.seen >= 2 ? s.correct / s.seen : 0;
    if (q.diff === 1) {
      t1++;
      if (acc >= 0.8) t1m++;
    } else if (q.diff === 3) {
      t3++;
      if (acc >= 0.8) t3m++;
    } else {
      t2++;
      if (acc >= 0.8) t2m++;
    }
  });
  var tier = 0;
  if (t1 === 0 || t1m / Math.max(t1, 1) >= 0.8) tier = 1;
  if (tier >= 1 && (t2 === 0 || t2m / Math.max(t2, 1) >= 0.8)) tier = 2;
  if (tier >= 2 && (t3 === 0 || t3m / Math.max(t3, 1) >= 0.8)) tier = 3;
  return {
    tier: tier,
    max: 3
  };
}
function getBlindSpots(data) {
  return QS.filter(function (q) {
    var s = data.questionStats[q.id];
    if (!s || !s.confHistory) return false;
    for (var i = s.confHistory.length - 1; i >= 0; i--) {
      if (s.confHistory[i] === "high_wrong") return true;
    }
    return false;
  });
}
function getBlindSpotCount(data) {
  return getBlindSpots(data).length;
}
const RANKS = [{
  name: "Pre-Med Newbie",
  min: 0,
  b: "\u{1F95A}"
}, {
  name: "Anatomy Apprentice",
  min: 100,
  b: "\u{1F423}"
}, {
  name: "Lab Rat",
  min: 300,
  b: "\u{1F401}"
}, {
  name: "Study Machine",
  min: 600,
  b: "\u2699\uFE0F"
}, {
  name: "Knowledge Knight",
  min: 1000,
  b: "\u{1F6E1}\uFE0F"
}, {
  name: "Science Sorcerer",
  min: 1800,
  b: "\u{1F9D9}"
}, {
  name: "MCAT Warrior",
  min: 3000,
  b: "\u2694\uFE0F"
}, {
  name: "528 Legend",
  min: 5000,
  b: "\u{1F451}"
}];
function getRank(x) {
  var r = RANKS[0];
  RANKS.forEach(function (k) {
    if (x >= k.min) r = k;
  });
  return r;
}
function getNext(x) {
  for (var i = 0; i < RANKS.length; i++) {
    if (x < RANKS[i].min) return RANKS[i];
  }
  return null;
}
function shuf(a) {
  var b = a.slice();
  for (var i = b.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = b[i];
    b[i] = b[j];
    b[j] = t;
  }
  return b;
}
const DD = {
  xp: 0,
  totalCorrect: 0,
  totalAnswered: 0,
  bestStreak: 0,
  questionStats: {},
  sessionHistory: [],
  calibration: {
    high: {
      total: 0,
      correct: 0
    },
    med: {
      total: 0,
      correct: 0
    },
    low: {
      total: 0,
      correct: 0
    }
  },
  flagged: [],
  lastStudyDate: "",
  currentStreak: 0,
  catTiming: {},
  hintsUsed: 0,
  tagHistory: {},
  studyTime: {},
  weeklyGoal: 100,
  weeklyProgress: {},
  theme: "dark",
  fontSize: 0
};
function getCatAcc(d, cat) {
  var qs = QS.filter(function (q) {
    return q.cat === cat;
  });
  var s = 0,
    c = 0;
  qs.forEach(function (q) {
    var st = d.questionStats[q.id];
    if (st) {
      s += st.seen;
      c += st.correct;
    }
  });
  return {
    seen: s,
    correct: c,
    pct: s > 0 ? Math.round(c / s * 100) : null
  };
}

// === TAG TREND TRACKING ===
function getTagTrend(data, tag) {
  var hist = (data.tagHistory || {})[tag] || [];
  if (hist.length < 2) return "none";
  var first = hist[0];
  var last = hist[hist.length - 1];
  var diff = last - first;
  if (diff >= 10) return "up";
  if (diff <= -10) return "down";
  return "flat";
}
function updateTagHistory(data, qTags, correct) {
  var th = Object.assign({}, data.tagHistory || {});
  (qTags || []).forEach(function (tag) {
    var arr = (th[tag] || []).slice();
    var tc = getTagCounts(data);
    var info = tc[tag];
    if (info && info.seen > 0) {
      arr.push(Math.round(info.correct / info.seen * 100));
    }
    if (arr.length > 5) arr = arr.slice(-5);
    th[tag] = arr;
  });
  return th;
}

// === SCORE PREDICTION ===
function getSectionAcc(data, sec) {
  var cats = Object.keys(CATS).filter(function (k) {
    return CATS[k].sec === sec;
  });
  var s = 0,
    c = 0;
  cats.forEach(function (cat) {
    var a = getCatAcc(data, cat);
    s += a.seen;
    c += a.correct;
  });
  return s > 0 ? Math.round(c / s * 100) : null;
}
function predictScore(pct) {
  if (pct === null) return null;
  if (pct >= 90) return {
    low: 130,
    high: 132
  };
  if (pct >= 80) return {
    low: 127,
    high: 129
  };
  if (pct >= 70) return {
    low: 125,
    high: 127
  };
  if (pct >= 60) return {
    low: 123,
    high: 125
  };
  return {
    low: 118,
    high: 122
  };
}
function getTotalPredicted(data) {
  var secs = ["Bio/Biochem", "Chem/Phys", "Psych/Soc", "CARS"];
  var total = 0,
    count = 0;
  secs.forEach(function (s) {
    var a = getSectionAcc(data, s);
    if (a !== null) {
      var p = predictScore(a);
      total += (p.low + p.high) / 2;
      count++;
    }
  });
  if (count < 4) return null;
  return Math.round(total);
}

// === STUDY TIME ===
function addStudySeconds(data, secs) {
  var st = Object.assign({}, data.studyTime || {});
  var today = todayStr();
  st[today] = (st[today] || 0) + secs;
  return st;
}
function getStudyToday(data) {
  return Math.round(((data.studyTime || {})[todayStr()] || 0) / 60);
}
function getStudyWeek(data) {
  var st = data.studyTime || {};
  var total = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    total += st[d] || 0;
  }
  return total;
}
function getStudyTotal(data) {
  var st = data.studyTime || {};
  var total = 0;
  Object.values(st).forEach(function (v) {
    total += v;
  });
  return total;
}
function fmtTime(secs) {
  var h = Math.floor(secs / 3600);
  var m = Math.round(secs % 3600 / 60);
  return h > 0 ? h + "h " + m + "m" : m + "m";
}

// === WEEKLY GOALS ===
function getWeekKey() {
  var d = new Date();
  var jan1 = new Date(d.getFullYear(), 0, 1);
  var wn = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return d.getFullYear() + "-W" + wn;
}
function getWeeklyQs(data) {
  return (data.weeklyProgress || {})[getWeekKey()] || 0;
}
function addWeeklyQ(data) {
  var wp = Object.assign({}, data.weeklyProgress || {});
  var wk = getWeekKey();
  wp[wk] = (wp[wk] || 0) + 1;
  return wp;
}

// === BADGES ===
function getBadges(data) {
  var d = data;
  var bs = d.bestStreak || 0;
  var ta = d.totalAnswered || 0;
  var ds = computeStreak(d);
  var catsTried = Object.keys(CATS).filter(function (k) {
    return getCatAcc(d, k).seen > 0;
  }).length;
  var cat90 = Object.keys(CATS).some(function (k) {
    var a = getCatAcc(d, k);
    return a.seen >= 5 && a.pct >= 90;
  });
  var passQs = QS.filter(function (q) {
    return q.pass && d.questionStats[q.id] && d.questionStats[q.id].seen > 0;
  }).length;
  var carsAll = QS.filter(function (q) {
    return q.cat === "CARS";
  }).every(function (q) {
    return d.questionStats[q.id] && d.questionStats[q.id].seen > 0;
  });
  var matchDone = QS.filter(function (q) {
    return q.type === "match" && d.questionStats[q.id] && d.questionStats[q.id].seen > 0;
  }).length > 0;
  var tagMaster = ALL_TAGS.some(function (tag) {
    var tc = getTagCounts(d);
    var info = tc[tag] || {};
    return info.seen >= 10 && info.correct / info.seen >= 0.9;
  });
  var blindCleared = QS.some(function (q) {
    var s = d.questionStats[q.id];
    if (!s || !s.confHistory) return false;
    var hw = false,
      hr = false;
    s.confHistory.forEach(function (c) {
      if (c === "high_wrong") hw = true;
      if (c === "high_right" && hw) hr = true;
    });
    return hw && hr;
  });
  var totalSecs = getStudyTotal(d);
  return [{
    id: "b1",
    name: "First Step",
    icon: "\u{1F476}",
    desc: "Answer your first question",
    done: ta >= 1
  }, {
    id: "b2",
    name: "Century",
    icon: "\u{1F4AF}",
    desc: "Answer 100 questions",
    done: ta >= 100
  }, {
    id: "b3",
    name: "Scholar",
    icon: "\u{1F393}",
    desc: "Answer 500 questions",
    done: ta >= 500
  }, {
    id: "b4",
    name: "Grandmaster",
    icon: "\u{1F3C6}",
    desc: "Answer 1000 questions",
    done: ta >= 1000
  }, {
    id: "b5",
    name: "On Fire",
    icon: "\u{1F525}",
    desc: "5-day study streak",
    done: ds >= 5
  }, {
    id: "b6",
    name: "Dedicated",
    icon: "\u{1F4AA}",
    desc: "15-day study streak",
    done: ds >= 15
  }, {
    id: "b7",
    name: "Iron Will",
    icon: "\u{1F9CA}",
    desc: "30-day study streak",
    done: ds >= 30
  }, {
    id: "b8",
    name: "A+ Student",
    icon: "\u{1F31F}",
    desc: "90%+ accuracy in any category",
    done: cat90
  }, {
    id: "b9",
    name: "Explorer",
    icon: "\u{1F30D}",
    desc: "Attempt all 12 categories",
    done: catsTried >= 12
  }, {
    id: "b10",
    name: "Scientist",
    icon: "\u{1F52C}",
    desc: "Answer 50 passage-based questions",
    done: passQs >= 50
  }, {
    id: "b11",
    name: "CARS Master",
    icon: "\u{1F4D6}",
    desc: "Complete all CARS questions",
    done: carsAll
  }, {
    id: "b12",
    name: "Deep Expert",
    icon: "\u{1F9E0}",
    desc: "Master a tag (90%+ with 10+ Qs)",
    done: tagMaster
  }, {
    id: "b13",
    name: "Self-Aware",
    icon: "\u{1F4A1}",
    desc: "Clear a blind spot",
    done: blindCleared
  }, {
    id: "b14",
    name: "Matchmaker",
    icon: "\u{1F91D}",
    desc: "Complete a matching question",
    done: matchDone
  }, {
    id: "b15",
    name: "Marathon Runner",
    icon: "\u23F1\uFE0F",
    desc: "3+ hours total study time",
    done: totalSecs >= 10800
  }];
}

// === EXPORT ===
function exportStats(data) {
  var secs = ["Bio/Biochem", "Chem/Phys", "Psych/Soc", "CARS"];
  var lines = [];
  lines.push("MCAT Quest Stats Export - " + new Date().toLocaleDateString());
  lines.push("Total: " + data.totalAnswered + " Qs | " + (data.totalAnswered > 0 ? Math.round(data.totalCorrect / data.totalAnswered * 100) : 0) + "% accuracy");
  lines.push("Streak: " + computeStreak(data) + " days | XP: " + data.xp);
  lines.push("Study time: " + fmtTime(getStudyTotal(data)) + " total, " + fmtTime(getStudyWeek(data)) + " this week");
  lines.push("");
  secs.forEach(function (s) {
    var a = getSectionAcc(data, s);
    var p = predictScore(a);
    lines.push(s + ": " + (a !== null ? a + "%" : "--") + (p ? " (est " + p.low + "-" + p.high + ")" : ""));
  });
  var tp = getTotalPredicted(data);
  if (tp) lines.push("Estimated total: ~" + tp + "/528");
  lines.push("");
  lines.push("Weak areas:");
  Object.keys(CATS).map(function (k) {
    return Object.assign({
      key: k
    }, getCatAcc(data, k));
  }).filter(function (c) {
    return c.seen >= 2;
  }).sort(function (a, b) {
    return a.pct - b.pct;
  }).slice(0, 3).forEach(function (c) {
    lines.push("  " + CATS[c.key].name + ": " + c.pct + "%");
  });
  return lines.join("\n");
}
function getSmartPool(mode, data, selTag) {
  if (mode === "SPACED_REVIEW") {
    var due = QS.filter(function (q) {
      return isDue(data, q.id);
    });
    return due.length ? {
      pool: due
    } : {
      msg: "All caught up!"
    };
  }
  if (mode === "HARD_QS") {
    var h = QS.filter(function (q) {
      var s = data.questionStats[q.id];
      return s && s.seen >= 1 && s.correct / s.seen < 0.7;
    });
    return h.length ? {
      pool: h
    } : {
      msg: "No hard questions yet!"
    };
  }
  if (mode === "NEW_QS") {
    var u = QS.filter(function (q) {
      return !data.questionStats[q.id];
    });
    return u.length ? {
      pool: u
    } : {
      msg: "All questions seen!"
    };
  }
  if (mode === "WEAK_TOPICS") {
    var cs = Object.keys(CATS).filter(function (k) {
      return k !== "CARS";
    }).map(function (k) {
      return Object.assign({
        key: k
      }, getCatAcc(data, k));
    }).filter(function (c) {
      return c.seen >= 2;
    }).sort(function (a, b) {
      return a.pct - b.pct;
    });
    return cs.length ? {
      pool: QS.filter(function (q) {
        return cs.slice(0, 3).some(function (c) {
          return c.key === q.cat;
        });
      })
    } : {
      msg: "Play more!"
    };
  }
  if (mode === "INTERLEAVED") return {
    pool: QS.filter(function (q) {
      return q.cat !== "CARS";
    })
  };
  if (mode === "TAG_PRACTICE") {
    if (!selTag) return {
      msg: "Select a tag"
    };
    var tq = QS.filter(function (q) {
      return (q.tags || []).indexOf(selTag) >= 0;
    });
    return tq.length ? {
      pool: tq
    } : {
      msg: "No questions for this tag"
    };
  }
  if (mode === "FLAGGED") {
    var fl = data.flagged || [];
    var fq = QS.filter(function (q) {
      return fl.indexOf(q.id) >= 0;
    });
    return fq.length ? {
      pool: fq
    } : {
      msg: "No flagged questions!"
    };
  }
  if (mode === "CARS_MODE") {
    var c = QS.filter(function (q) {
      return q.cat === "CARS";
    });
    return c.length ? {
      pool: c
    } : {
      msg: "No CARS questions"
    };
  }
  if (mode === "REVIEW") {
    var m = QS.filter(function (q) {
      var s = data.questionStats[q.id];
      return s && s.seen > 0 && s.correct / s.seen < 0.6;
    });
    return m.length ? {
      pool: m
    } : {
      msg: "No missed questions!"
    };
  }
  if (mode === "BLIND_SPOTS") {
    var bs = getBlindSpots(data);
    return bs.length ? {
      pool: bs
    } : {
      msg: "None detected -- great calibration!"
    };
  }
  if (mode === "SECTION_SIM") return {
    pool: []
  };
  return {
    pool: QS.filter(function (q) {
      return q.cat !== "CARS";
    })
  };
}
function buildQSet(pool, mode, data) {
  var count = mode === "BOSS_BATTLE" ? 5 : Math.min(15, pool.length);
  // Adaptive difficulty: sort by diff tier, prioritize unmastered + due
  var scored = pool.map(function (q) {
    var s = data ? data.questionStats[q.id] : null;
    var acc = s && s.seen >= 2 ? s.correct / s.seen : 0;
    var mastered = acc >= 0.8;
    var due = data ? isDue(data, q.id) : true;
    var priority = (q.diff || 2) * 100 + (mastered ? 50 : 0) + (due ? 0 : 25);
    return {
      q: q,
      priority: priority
    };
  });
  scored.sort(function (a, b) {
    return a.priority - b.priority;
  });
  var sorted = scored.map(function (s) {
    return s.q;
  });
  // Pick from sorted, ensuring category diversity
  var byCat = {};
  sorted.forEach(function (q) {
    if (!byCat[q.cat]) byCat[q.cat] = [];
    byCat[q.cat].push(q);
  });
  var ck = shuf(Object.keys(byCat));
  var picked = [];
  var r = 0;
  while (picked.length < count) {
    var any = false;
    ck.forEach(function (c) {
      if (picked.length < count && r < byCat[c].length) {
        picked.push(byCat[c][r]);
        any = true;
      }
    });
    if (!any) break;
    r++;
  }
  // Light shuffle within same difficulty to avoid predictable order
  var result = picked;
  return result.map(function (q) {
    if (q.type === "match") {
      var sp = shuf(q.pairs.map(function (p) {
        return p.slice();
      }));
      return Object.assign({}, q, {
        pairs: sp,
        shuffledRight: shuf(sp.map(function (p) {
          return p[1];
        }))
      });
    }
    var ct = q.o[q.a];
    var so = shuf(q.o.slice());
    return Object.assign({}, q, {
      o: so,
      a: so.indexOf(ct)
    });
  });
}
function PinScreen(_ref) {
  let {
    onLogin
  } = _ref;
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lt, setLt] = useState(0);
  var saved = getSavedPin();
  useEffect(function () {
    if (saved) {
      setPin(saved);
      dl(saved);
    }
  }, []);
  useEffect(function () {
    if (!loading) return;
    var iv = setInterval(function () {
      setLt(function (t) {
        return t + 1;
      });
    }, 1000);
    return function () {
      clearInterval(iv);
    };
  }, [loading]);
  function dl(p) {
    if (p.length < 3) {
      setErr("PIN 3+ chars");
      return;
    }
    setLoading(true);
    setErr("");
    setLt(0);
    loadFromCloud(p).then(function (d) {
      rememberPin(p);
      var merged = Object.assign({}, DD, d || {});
      onLogin(p, merged);
    }).catch(function () {
      setLoading(false);
      setErr("Failed. Retry.");
    });
  }
  if (saved && loading) return /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.c,
      background: "#0f0f14",
      color: "#e8e6e3"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 48,
      animation: "pulse 1.5s infinite"
    }
  }, "\u{1F9EC}"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: "#555",
      marginTop: 10
    }
  }, "Loading..."), lt > 5 ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: function () {
      onLogin(saved, Object.assign({}, DD));
    },
    style: {
      padding: "10px 20px",
      background: "rgba(102,126,234,.2)",
      border: "1px solid rgba(102,126,234,.4)",
      borderRadius: 8,
      color: "#667eea",
      fontSize: 12,
      fontWeight: 600
    }
  }, "Start offline"), /*#__PURE__*/React.createElement("button", {
    onClick: function () {
      try {
        localStorage.removeItem("mcat_pin");
      } catch (e) {}
      setLoading(false);
    },
    style: {
      padding: "10px 20px",
      marginLeft: 8,
      background: "rgba(255,255,255,.06)",
      border: "1px solid rgba(255,255,255,.1)",
      borderRadius: 8,
      color: "#888",
      fontSize: 12
    }
  }, "Change PIN")) : null)));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      ...S.c,
      background: "#0f0f14",
      color: "#e8e6e3",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 340,
      width: "100%",
      textAlign: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 52,
      marginBottom: 8
    }
  }, "\u{1F9EC}"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 28,
      fontWeight: 900,
      color: "#fff",
      letterSpacing: 3,
      margin: "0 0 4px"
    }
  }, "MCAT", /*#__PURE__*/React.createElement("span", {
    style: S.a
  }, "QUEST")), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      color: "#555",
      marginBottom: 30,
      letterSpacing: 2
    }
  }, "ENTER PIN TO SYNC"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: pin,
    onChange: function (e) {
      setPin(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""));
    },
    onKeyDown: function (e) {
      if (e.key === "Enter") dl(pin);
    },
    placeholder: "your-pin",
    style: {
      width: "100%",
      padding: "14px 16px",
      background: "rgba(255,255,255,.06)",
      border: "1.5px solid rgba(255,255,255,.12)",
      borderRadius: 10,
      color: "#fff",
      fontSize: 18,
      fontFamily: "inherit",
      textAlign: "center",
      letterSpacing: 4,
      outline: "none"
    },
    autoFocus: true
  }), err && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 11,
      color: "#f87171",
      marginTop: 8
    }
  }, err), /*#__PURE__*/React.createElement("button", {
    onClick: function () {
      dl(pin);
    },
    disabled: loading || pin.length < 3,
    style: {
      width: "100%",
      padding: 14,
      marginTop: 16,
      background: pin.length >= 3 ? "linear-gradient(135deg,#667eea,#764ba2)" : "rgba(255,255,255,.06)",
      color: "#fff",
      borderRadius: 10,
      fontSize: 15,
      fontWeight: 700,
      opacity: pin.length >= 3 ? 1 : .4
    }
  }, loading ? "Loading..." : "Enter")));
}
function Game(_ref2) {
  let {
    pin,
    initialData
  } = _ref2;
  const [scr, setScr] = useState("home");
  const [data, setData] = useState(initialData);
  const [ss, setSS] = useState("");
  const [streak, setStreak] = useState(0);
  const [gm, setGM] = useState(null);
  const [selCats, setSelCats] = useState([]);
  const [selTag, setSelTag] = useState(null);
  const [qs, setQs] = useState([]);
  const [qi, setQI] = useState(0);
  const [sel, setSel] = useState(null);
  const [sr, setSR] = useState(false);
  const [tl, setTL] = useState(null);
  const [sScore, setSScore] = useState(0);
  const [sCorrect, setSC] = useState(0);
  const [sTotal, setST] = useState(0);
  const [wrong, setWrong] = useState([]);
  const [shake, setShake] = useState(false);
  const [flash, setFlash] = useState(false);
  const [lives, setLives] = useState(3);
  const [sTab, setSTab] = useState("overview");
  const [conf, setConf] = useState(null);
  const [awaitConf, setAwaitConf] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [matchSel, setMatchSel] = useState(null);
  const [matchDone, setMatchDone] = useState([]);
  const [matchResults, setMatchResults] = useState([]);
  // NEW STATE: hint, pause, navigator, timing
  const [hintUsed, setHintUsed] = useState(false);
  const [eliminated, setEliminated] = useState([]);
  const [paused, setPaused] = useState(false);
  const [qAnswered, setQAnswered] = useState({});
  const tr = useRef(null);
  const qStartRef = useRef(Date.now());
  const dirtyRef = useRef(false);

  // Cloud save debounce - ONLY when user has actually interacted (dirty)
  useEffect(function () {
    if (!dirtyRef.current) return;
    var t = setTimeout(function () {
      setSS("saving");
      saveToCloud(pin, data).then(function (ok) {
        setSS(ok ? "saved" : "error");
        if (ok) setTimeout(function () {
          setSS("");
        }, 1500);
      });
    }, 800);
    return function () {
      clearTimeout(t);
    };
  }, [data]);

  // Timer tick (respects pause)
  useEffect(function () {
    if (tl === null || tl <= 0 || sr || paused) return;
    tr.current = setTimeout(function () {
      setTL(function (t) {
        return t - 1;
      });
    }, 1000);
    return function () {
      clearTimeout(tr.current);
    };
  }, [tl, sr, paused]);

  // Timer expiry
  useEffect(function () {
    if (tl === 0 && !sr && !awaitConf && !paused) {
      setAwaitConf(true);
      commitAnswer("low");
    }
  }, [tl]);

  // Reset qStartTime whenever qi changes or pause ends
  useEffect(function () {
    qStartRef.current = Date.now();
  }, [qi]);
  useEffect(function () {
    if (!paused) qStartRef.current = Date.now();
  }, [paused]);

  // NEW STATE: think delay, concept card
  const [thinkDelay, setThinkDelay] = useState(0);
  const [showConceptCard, setShowConceptCard] = useState(null);
  const [simSection, setSimSection] = useState(null);
  const [simTimer, setSimTimer] = useState(null);
  const [openCard, setOpenCard] = useState(null);
  const [refTab, setRefTab] = useState("aa");
  var theme = data.theme || "dark";
  var fz = data.fontSize || 0;
  function toggleTheme() {
    dirtyRef.current = true;
    setData(function (d) {
      return Object.assign({}, d, {
        theme: d.theme === "light" ? "dark" : "light"
      });
    });
  }
  function adjustFont(delta) {
    dirtyRef.current = true;
    setData(function (d) {
      var nf = Math.max(-4, Math.min(8, (d.fontSize || 0) + delta));
      return Object.assign({}, d, {
        fontSize: nf
      });
    });
  }
  var isDark = theme === "dark";
  var bg = isDark ? "#0f0f14" : "#fafafa";
  var fg = isDark ? "#e8e6e3" : "#1a1a2e";
  var cbg = isDark ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.03)";
  var cbr = isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.08)";
  var sbg = isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)";
  var TC = {
    bg: bg,
    fg: fg,
    cbg: cbg,
    cbr: cbr,
    sbg: sbg,
    muted: isDark ? "#888" : "#666",
    dim: isDark ? "#555" : "#999",
    card: isDark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)"
  };
  function startGame(mode, cats, tag) {
    var pool;
    if (MODES[mode].smart) {
      var r = getSmartPool(mode, data, tag);
      if (!r.pool) {
        alert(r.msg);
        return;
      }
      pool = r.pool;
    } else {
      var ck = cats.length ? cats : Object.keys(CATS).filter(function (k) {
        return k !== "CARS";
      });
      pool = QS.filter(function (q) {
        return ck.indexOf(q.cat) >= 0;
      });
    }
    // Check if concept card should show for tag practice with unseen tag
    if (mode === "TAG_PRACTICE" && tag && typeof CARDS !== "undefined" && CARDS[tag]) {
      var tagSeen = 0;
      QS.filter(function (q) {
        return (q.tags || []).indexOf(tag) >= 0;
      }).forEach(function (q) {
        var s = data.questionStats[q.id];
        if (s && s.seen > 0) tagSeen++;
      });
      if (tagSeen === 0) {
        setShowConceptCard(tag);
        setGM(mode);
        setSelTag(tag);
        return;
      }
    }
    var built = buildQSet(pool, mode, data);
    setQs(built);
    setQI(0);
    setSel(null);
    setSR(false);
    setSScore(0);
    setSC(0);
    setST(0);
    setWrong([]);
    setGM(mode);
    setLives(3);
    setStreak(0);
    setConf(null);
    setAwaitConf(false);
    setMatchSel(null);
    setMatchDone([]);
    setMatchResults([]);
    setHintUsed(false);
    setEliminated([]);
    setPaused(false);
    setQAnswered({});
    setTL(MODES[mode].time || null);
    setThinkDelay(0);
    qStartRef.current = Date.now();
    setScr("play");
  }
  function launchAfterCard() {
    var tag = showConceptCard;
    setShowConceptCard(null);
    var pool;
    var r = getSmartPool("TAG_PRACTICE", data, tag);
    if (!r.pool) return;
    pool = r.pool;
    var built = buildQSet(pool, "TAG_PRACTICE", data);
    setQs(built);
    setQI(0);
    setSel(null);
    setSR(false);
    setSScore(0);
    setSC(0);
    setST(0);
    setWrong([]);
    setLives(3);
    setStreak(0);
    setConf(null);
    setAwaitConf(false);
    setMatchSel(null);
    setMatchDone([]);
    setMatchResults([]);
    setHintUsed(false);
    setEliminated([]);
    setPaused(false);
    setQAnswered({});
    setTL(null);
    setThinkDelay(0);
    qStartRef.current = Date.now();
    setScr("play");
  }
  function startSectionSim(sec) {
    var secCats = Object.keys(CATS).filter(function (k) {
      return CATS[k].sec === sec;
    });
    var pool = QS.filter(function (q) {
      return secCats.indexOf(q.cat) >= 0;
    });
    // 70% passage, 30% standalone
    var passQs = shuf(pool.filter(function (q) {
      return q.pass;
    }));
    var standQs = shuf(pool.filter(function (q) {
      return !q.pass;
    }));
    var picked = [];
    var pTarget = 14,
      sTarget = 6;
    picked = picked.concat(passQs.slice(0, Math.min(pTarget, passQs.length)));
    picked = picked.concat(standQs.slice(0, Math.min(sTarget, standQs.length)));
    while (picked.length < 20 && passQs.length > picked.filter(function (q) {
      return q.pass;
    }).length) {
      picked.push(passQs[picked.filter(function (q) {
        return q.pass;
      }).length]);
    }
    while (picked.length < 20 && standQs.length > picked.filter(function (q) {
      return !q.pass;
    }).length) {
      picked.push(standQs[picked.filter(function (q) {
        return !q.pass;
      }).length]);
    }
    picked = picked.slice(0, 20);
    var built = shuf(picked).map(function (q) {
      if (q.type === "match") {
        var sp = shuf(q.pairs.map(function (p) {
          return p.slice();
        }));
        return Object.assign({}, q, {
          pairs: sp,
          shuffledRight: shuf(sp.map(function (p) {
            return p[1];
          }))
        });
      }
      var ct = q.o[q.a];
      var so = shuf(q.o.slice());
      return Object.assign({}, q, {
        o: so,
        a: so.indexOf(ct)
      });
    });
    setQs(built);
    setQI(0);
    setSel(null);
    setSR(false);
    setSScore(0);
    setSC(0);
    setST(0);
    setWrong([]);
    setGM("SECTION_SIM");
    setLives(3);
    setStreak(0);
    setConf(null);
    setAwaitConf(false);
    setMatchSel(null);
    setMatchDone([]);
    setMatchResults([]);
    setHintUsed(false);
    setEliminated([]);
    setPaused(false);
    setQAnswered({});
    setTL(null);
    setThinkDelay(0);
    setSimSection(sec);
    setSimTimer(1800);
    qStartRef.current = Date.now();
    setScr("play");
  }

  // Section sim overall timer
  useEffect(function () {
    if (simTimer === null || simTimer <= 0 || scr !== "play" || gm !== "SECTION_SIM" || paused) return;
    var iv = setTimeout(function () {
      setSimTimer(function (t) {
        return t - 1;
      });
    }, 1000);
    return function () {
      clearTimeout(iv);
    };
  }, [simTimer, scr, gm, paused]);
  useEffect(function () {
    if (simTimer === 0 && gm === "SECTION_SIM" && scr === "play") fin();
  }, [simTimer]);
  function handleAnswer(idx) {
    if (sr || awaitConf || paused) return;
    setSel(idx);
  }
  function lockIn() {
    if (sel === null || sr || awaitConf || paused) return;
    setAwaitConf(true);
    clearTimeout(tr.current);
  }
  function useHint() {
    if (hintUsed || sr || awaitConf || paused) return;
    var q = qs[qi];
    if (!q || q.type === "match") return;
    var wrongIdxs = [];
    q.o.forEach(function (_, i) {
      if (i !== q.a && eliminated.indexOf(i) < 0) wrongIdxs.push(i);
    });
    var toElim = shuf(wrongIdxs).slice(0, 2);
    setEliminated(toElim);
    setHintUsed(true);
    if (sel !== null && toElim.indexOf(sel) >= 0) setSel(null);
  }
  function commitAnswer(confidence) {
    dirtyRef.current = true;
    var q = qs[qi];
    var actualIdx = sel !== null ? sel : -1;
    var correct = actualIdx === q.a;
    var elapsed = Math.round((Date.now() - qStartRef.current) / 1000);
    // Think delay: wrong answers get 4s delay before explanation shows
    if (!correct) {
      setThinkDelay(4);
      var tid = setInterval(function () {
        setThinkDelay(function (v) {
          if (v <= 1) {
            clearInterval(tid);
            return 0;
          }
          return v - 1;
        });
      }, 1000);
    } else {
      setThinkDelay(0);
    }
    setSR(true);
    setAwaitConf(false);
    setST(function (t) {
      return t + 1;
    });
    setConf(confidence);
    setQAnswered(function (p) {
      var n = Object.assign({}, p);
      n[qi] = true;
      return n;
    });
    var streakBonus = streak >= 5 ? 25 : streak >= 3 ? 15 : 0;
    var dayStreakVal = computeStreak(data);
    var streakMultiplier = dayStreakVal >= 3 ? 1.1 : 1.0;
    var earned = 0;
    if (correct) {
      var tb = tl ? Math.floor(tl * 2) : 0;
      earned = Math.round(((gm === "BOSS_BATTLE" ? 30 : 15) + tb + streakBonus + (q.diff || 1) * 3) * streakMultiplier);
      if (hintUsed) earned = Math.round(earned * 0.5);
      setSScore(function (s) {
        return s + earned;
      });
      setSC(function (c) {
        return c + 1;
      });
      setStreak(function (s) {
        return s + 1;
      });
      setFlash(true);
      setTimeout(function () {
        setFlash(false);
      }, 600);
    } else {
      setStreak(0);
      setWrong(function (w) {
        return w.concat([q]);
      });
      setShake(true);
      setTimeout(function () {
        setShake(false);
      }, 500);
      if (gm === "BOSS_BATTLE") setLives(function (l) {
        return l - 1;
      });
    }
    // Track blind spot: confident + wrong
    var confTag = confidence === "high" && !correct ? "high_wrong" : confidence === "high" && correct ? "high_right" : confidence;
    setData(function (d) {
      var st = Object.assign({}, d.questionStats);
      var p = st[q.id] || {
        seen: 0,
        correct: 0,
        box: 1,
        nextReview: 0,
        streak: 0,
        confHistory: []
      };
      var ub = updateBox({
        questionStats: st
      }, q.id, correct);
      var ch = (p.confHistory || []).concat([confTag]).slice(-20);
      st[q.id] = Object.assign({}, p, ub, {
        seen: p.seen + 1,
        correct: p.correct + (correct ? 1 : 0),
        lastSeen: Date.now(),
        streak: correct ? (p.streak || 0) + 1 : 0,
        confHistory: ch
      });
      var cal = Object.assign({}, d.calibration || DD.calibration);
      if (confidence && cal[confidence]) cal[confidence] = {
        total: (cal[confidence].total || 0) + 1,
        correct: (cal[confidence].correct || 0) + (correct ? 1 : 0)
      };
      var ct = Object.assign({}, d.catTiming || {});
      var cc = ct[q.cat] || {
        total: 0,
        count: 0
      };
      ct[q.cat] = {
        total: cc.total + elapsed,
        count: cc.count + 1
      };
      var su = updateStreakForToday(d);
      var stm = addStudySeconds(d, elapsed);
      var th = updateTagHistory(d, q.tags, correct);
      var wp = addWeeklyQ(d);
      return Object.assign({}, d, {
        xp: d.xp + earned,
        totalCorrect: d.totalCorrect + (correct ? 1 : 0),
        totalAnswered: d.totalAnswered + 1,
        bestStreak: correct ? Math.max(d.bestStreak, streak + 1) : d.bestStreak,
        questionStats: st,
        calibration: cal,
        catTiming: ct,
        lastStudyDate: su.lastStudyDate,
        currentStreak: su.currentStreak,
        hintsUsed: (d.hintsUsed || 0) + (hintUsed ? 1 : 0),
        studyTime: stm,
        tagHistory: th,
        weeklyProgress: wp
      });
    });
  }
  function handleMatchTap(side, idx) {
    var q = qs[qi];
    if (sr || paused) return;
    if (side === "left") {
      setMatchSel(matchSel === idx ? null : idx);
    } else if (matchSel !== null) {
      var leftItem = q.pairs[matchSel][0];
      var rightItem = q.shuffledRight[idx];
      var correctRight = q.pairs[matchSel][1];
      var isCorrect = rightItem === correctRight;
      var newDone = matchDone.concat([matchSel]);
      var newResults = matchResults.concat([{
        left: leftItem,
        right: rightItem,
        correct: isCorrect,
        expected: correctRight
      }]);
      setMatchDone(newDone);
      setMatchResults(newResults);
      setMatchSel(null);
      if (newDone.length === q.pairs.length) {
        var allCorrect = newResults.every(function (r) {
          return r.correct;
        });
        setSR(true);
        setST(function (t) {
          return t + 1;
        });
        setQAnswered(function (p) {
          var n = Object.assign({}, p);
          n[qi] = true;
          return n;
        });
        var earned = (allCorrect ? 20 : 5) + (q.diff || 1) * 3;
        if (allCorrect) {
          setSScore(function (s) {
            return s + earned;
          });
          setSC(function (c) {
            return c + 1;
          });
          setStreak(function (s) {
            return s + 1;
          });
          setFlash(true);
          setTimeout(function () {
            setFlash(false);
          }, 600);
        } else {
          setStreak(0);
          setWrong(function (w) {
            return w.concat([q]);
          });
          setShake(true);
          setTimeout(function () {
            setShake(false);
          }, 500);
        }
        dirtyRef.current = true;
        setData(function (d) {
          var st = Object.assign({}, d.questionStats);
          var p = st[q.id] || {
            seen: 0,
            correct: 0,
            box: 1,
            nextReview: 0
          };
          var ub = updateBox({
            questionStats: st
          }, q.id, allCorrect);
          st[q.id] = Object.assign({}, p, ub, {
            seen: p.seen + 1,
            correct: p.correct + (allCorrect ? 1 : 0),
            lastSeen: Date.now()
          });
          var su = updateStreakForToday(d);
          var wp = addWeeklyQ(d);
          return Object.assign({}, d, {
            xp: d.xp + earned,
            totalCorrect: d.totalCorrect + (allCorrect ? 1 : 0),
            totalAnswered: d.totalAnswered + 1,
            bestStreak: allCorrect ? Math.max(d.bestStreak, streak + 1) : d.bestStreak,
            questionStats: st,
            lastStudyDate: su.lastStudyDate,
            currentStreak: su.currentStreak,
            weeklyProgress: wp
          });
        });
      }
    }
  }
  function goToQ(idx) {
    if (idx < 0 || idx >= qs.length || idx === qi) return;
    setQI(idx);
    setSel(null);
    setSR(!!qAnswered[idx]);
    setHintUsed(false);
    setEliminated([]);
    setConf(null);
    setAwaitConf(false);
    setMatchSel(null);
    setMatchDone([]);
    setMatchResults([]);
    setThinkDelay(0);
    if (MODES[gm] && MODES[gm].time && !qAnswered[idx]) setTL(MODES[gm].time);
    qStartRef.current = Date.now();
  }
  function nextQ() {
    if (gm === "BOSS_BATTLE" && lives <= 0) {
      fin();
      return;
    }
    // Find next unanswered, or wrap up
    var next = -1;
    for (var i = qi + 1; i < qs.length; i++) {
      if (!qAnswered[i]) {
        next = i;
        break;
      }
    }
    if (next >= 0) {
      goToQ(next);
    } else {
      var anyLeft = false;
      for (var j = 0; j < qs.length; j++) {
        if (!qAnswered[j]) {
          anyLeft = true;
          break;
        }
      }
      if (!anyLeft) fin();else goToQ(qs.findIndex(function (_, k) {
        return !qAnswered[k];
      }));
    }
  }
  function fin() {
    dirtyRef.current = true;
    setData(function (d) {
      return Object.assign({}, d, {
        sessionHistory: d.sessionHistory.concat([{
          date: Date.now(),
          mode: gm,
          correct: sCorrect,
          total: sTotal,
          score: sScore
        }]).slice(-50)
      });
    });
    setScr("results");
  }
  function toggleFlag(qid) {
    dirtyRef.current = true;
    setData(function (d) {
      var fl = (d.flagged || []).slice();
      var idx = fl.indexOf(qid);
      if (idx >= 0) fl.splice(idx, 1);else fl.push(qid);
      return Object.assign({}, d, {
        flagged: fl
      });
    });
  }
  var rank = getRank(data.xp),
    nr = getNext(data.xp);
  var newC = QS.filter(function (q) {
    return !data.questionStats[q.id];
  }).length;
  var hardC = QS.filter(function (q) {
    var s = data.questionStats[q.id];
    return s && s.seen >= 1 && s.correct / s.seen < 0.7;
  }).length;
  var missC = QS.filter(function (q) {
    var s = data.questionStats[q.id];
    return s && s.seen > 0 && s.correct / s.seen < 0.6;
  }).length;
  var dueC = getDueCount(data);
  var flagC = (data.flagged || []).length;
  var weakC = Object.keys(CATS).filter(function (k) {
    return k !== "CARS";
  }).map(function (k) {
    return Object.assign({
      key: k
    }, getCatAcc(data, k));
  }).filter(function (c) {
    return c.seen >= 2;
  }).sort(function (a, b) {
    return a.pct - b.pct;
  }).slice(0, 3);
  var carsC = QS.filter(function (q) {
    return q.cat === "CARS";
  }).length;
  var dayStreak = computeStreak(data);
  var acc = data.totalAnswered > 0 ? Math.round(data.totalCorrect / data.totalAnswered * 100) : 0;
  var blindC = getBlindSpotCount(data);
  var lastCarsDate = (data.sessionHistory || []).filter(function (s) {
    return s.mode === "CARS_MODE";
  }).slice(-1);
  var daysSinceCars = lastCarsDate.length ? Math.round((Date.now() - lastCarsDate[0].date) / 86400000) : 99;
  var SB = function () {
    return ss ? /*#__PURE__*/React.createElement("div", {
      style: {
        position: "fixed",
        bottom: 12,
        right: 12,
        fontSize: 9,
        padding: "4px 10px",
        borderRadius: 10,
        background: ss === "saved" ? "rgba(74,222,128,.2)" : ss === "error" ? "rgba(248,113,113,.2)" : "rgba(102,126,234,.2)",
        color: ss === "saved" ? "#4ade80" : ss === "error" ? "#f87171" : "#667eea",
        zIndex: 999
      }
    }, ss === "saving" ? "Syncing..." : ss === "saved" ? "\u2705 Synced" : "\u26A0\uFE0F Error") : null;
  };

  // === CONCEPT CARD PRE-QUIZ ===
  if (showConceptCard) {
    var cardTag = showConceptCard;
    var cardData = typeof CARDS !== "undefined" && CARDS[cardTag] ? CARDS[cardTag] : null;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.c,
        background: bg,
        color: fg
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...S.bk,
        color: TC.muted
      },
      onClick: function () {
        setShowConceptCard(null);
        setScr("home");
      }
    }, "<", "- Back"), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 36
      }
    }, "\u{1F4D6}"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 20,
        fontWeight: 800,
        color: "#fff",
        margin: "8px 0 4px"
      }
    }, cardTag), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 11,
        color: "#888"
      }
    }, "Review these key concepts before quizzing")), cardData ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 20
      }
    }, cardData.map(function (bullet, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: "10px 14px",
          background: "rgba(102,126,234,.06)",
          border: "1px solid rgba(102,126,234,.15)",
          borderRadius: 10,
          fontSize: 12,
          color: TC.muted,
          lineHeight: 1.7
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          color: "#667eea",
          fontWeight: 700,
          marginRight: 6
        }
      }, i + 1, "."), bullet);
    })) : /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 20,
        textAlign: "center",
        color: "#555"
      }
    }, "No concept card for this tag yet."), /*#__PURE__*/React.createElement("button", {
      onClick: launchAfterCard,
      style: S.btn
    }, "\u{1F3AF}", " Ready to Quiz")));
  }

  // === STUDY CARDS BROWSER ===
  if (scr === "study_cards") {
    var cardTags = typeof CARDS !== "undefined" ? Object.keys(CARDS).sort() : [];
    var cardCats = {};
    cardTags.forEach(function (tag) {
      var firstQ = QS.find(function (q) {
        return (q.tags || []).indexOf(tag) >= 0;
      });
      var sec = firstQ ? CATS[firstQ.cat].sec : "Other";
      if (!cardCats[sec]) cardCats[sec] = [];
      cardCats[sec].push(tag);
    });
    return /*#__PURE__*/React.createElement("div", {
      style: S.c
    }, /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...S.bk,
        color: TC.muted
      },
      onClick: function () {
        setScr("home");
      }
    }, "<", "- Back"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: fg,
        margin: "0 0 14px"
      }
    }, "\u{1F4D6}", " Study Cards"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 11,
        color: TC.muted,
        marginBottom: 14,
        lineHeight: 1.5
      }
    }, "Mini-lessons for key MCAT concepts. Tap to expand."), openCard && CARDS[openCard] ? /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 16
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setOpenCard(null);
      },
      style: {
        fontSize: 11,
        color: "#667eea",
        marginBottom: 8
      }
    }, "<", "- All Cards"), /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 16,
        fontWeight: 700,
        color: fg,
        marginBottom: 10
      }
    }, openCard), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    }, CARDS[openCard].map(function (b, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: "10px 14px",
          background: "rgba(102,126,234,.06)",
          border: "1px solid rgba(102,126,234,.15)",
          borderRadius: 10,
          fontSize: 12,
          color: TC.muted,
          lineHeight: 1.7
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          color: "#667eea",
          fontWeight: 700,
          marginRight: 6
        }
      }, i + 1, "."), b);
    })), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setSelTag(openCard);
        startGame("TAG_PRACTICE", [], openCard);
      },
      style: Object.assign({}, S.btn, {
        marginTop: 14
      })
    }, "\u{1F3AF}", " Quiz This Topic")) : Object.entries(cardCats).map(function (e) {
      return /*#__PURE__*/React.createElement("div", {
        key: e[0],
        style: {
          marginBottom: 14
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: S.sh
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          ...S.sln,
          background: TC.sbg
        }
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          ...S.stt,
          color: TC.dim
        }
      }, e[0].toUpperCase()), /*#__PURE__*/React.createElement("span", {
        style: {
          ...S.sln,
          background: TC.sbg
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: 6
        }
      }, e[1].map(function (tag) {
        return /*#__PURE__*/React.createElement("button", {
          key: tag,
          onClick: function () {
            setOpenCard(tag);
          },
          style: {
            padding: "6px 12px",
            borderRadius: 16,
            fontSize: 11,
            fontWeight: 600,
            border: "1px solid rgba(102,126,234,.2)",
            background: "rgba(102,126,234,.06)",
            color: "#aac"
          }
        }, "\u{1F4D6}", " ", tag);
      })));
    })));
  }

  // === HOME ===
  if (scr === "home") {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.c,
        background: bg,
        color: fg
      }
    }, /*#__PURE__*/React.createElement(SB, null), /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 6,
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        adjustFont(-2);
      },
      style: {
        fontSize: 12,
        color: TC.muted,
        padding: "2px 6px",
        border: "1px solid " + TC.cbr,
        borderRadius: 6
      }
    }, "A-"), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        adjustFont(2);
      },
      style: {
        fontSize: 14,
        color: TC.muted,
        padding: "2px 6px",
        border: "1px solid " + TC.cbr,
        borderRadius: 6
      }
    }, "A+"), /*#__PURE__*/React.createElement("button", {
      onClick: toggleTheme,
      style: {
        fontSize: 16,
        padding: "2px 6px"
      }
    }, isDark ? "\u2600\uFE0F" : "\u{1F319}")), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginBottom: 20
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 42
      }
    }, "\u{1F9EC}"), /*#__PURE__*/React.createElement("h1", {
      style: {
        ...S.t,
        color: fg
      }
    }, "MCAT", /*#__PURE__*/React.createElement("span", {
      style: S.a
    }, "QUEST")), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 10,
        color: TC.dim,
        letterSpacing: 2
      }
    }, "v11 FINAL ", "\u2022", " SIMS ", "\u2022", " REFS ", "\u2022", " THEMES")), dayStreak >= 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginBottom: 12,
        padding: "10px 14px",
        background: "linear-gradient(135deg,rgba(255,150,50,.1),rgba(255,100,0,.08))",
        border: "1px solid rgba(255,150,50,.25)",
        borderRadius: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 20
      }
    }, "\u{1F525}"), " ", /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 14,
        fontWeight: 800,
        color: "#ff9933"
      }
    }, dayStreak, "-day streak!"), dayStreak >= 3 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: "#ffa033",
        marginLeft: 6
      }
    }, "+10% XP bonus")), function () {
      var wg = data.weeklyGoal || 100;
      var wq = getWeeklyQs(data);
      var wpct = Math.min(Math.round(wq / wg * 100), 100);
      var stToday = getStudyToday(data);
      var stWeek = fmtTime(getStudyWeek(data));
      var hitGoal = wq >= wg;
      return /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          gap: 10,
          marginBottom: 14,
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          position: "relative",
          width: 56,
          height: 56,
          flexShrink: 0
        }
      }, /*#__PURE__*/React.createElement("svg", {
        width: "56",
        height: "56",
        viewBox: "0 0 56 56"
      }, /*#__PURE__*/React.createElement("circle", {
        cx: "28",
        cy: "28",
        r: "24",
        fill: "none",
        stroke: "rgba(255,255,255,.08)",
        strokeWidth: "4"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "28",
        cy: "28",
        r: "24",
        fill: "none",
        stroke: hitGoal ? "#4ade80" : "#667eea",
        strokeWidth: "4",
        strokeDasharray: 2 * Math.PI * 24,
        strokeDashoffset: 2 * Math.PI * 24 * (1 - wpct / 100),
        strokeLinecap: "round",
        transform: "rotate(-90 28 28)",
        style: {
          transition: "stroke-dashoffset .5s"
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: 56,
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 800,
          color: hitGoal ? "#4ade80" : "#fff"
        }
      }, wpct, "%")), /*#__PURE__*/React.createElement("div", {
        style: {
          flex: 1
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: hitGoal ? "#4ade80" : "#fff"
        }
      }, hitGoal ? "\u{1F389} Goal hit!" : "Weekly: " + wq + "/" + wg + " Qs"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "#666",
          marginTop: 2
        }
      }, "Today: ", stToday, "min ", "\u2022", " Week: ", stWeek)), /*#__PURE__*/React.createElement("button", {
        onClick: function () {
          var nv = prompt("Set weekly question goal:", wg);
          if (nv && !isNaN(parseInt(nv))) {
            dirtyRef.current = true;
            setData(function (d) {
              return Object.assign({}, d, {
                weeklyGoal: parseInt(nv)
              });
            });
          }
        },
        style: {
          fontSize: 9,
          color: "#667eea",
          padding: "4px 8px",
          border: "1px solid rgba(102,126,234,.3)",
          borderRadius: 6
        }
      }, "Edit"));
    }(), /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.sb,
        background: TC.sbg,
        border: "1px solid " + TC.cbr
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: S.si
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sv,
        color: fg
      }
    }, rank.b, " ", rank.name), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sl,
        color: TC.dim
      }
    }, "Rank")), /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.dv,
        background: TC.sbg
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: S.si
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sv,
        color: fg
      }
    }, data.xp), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sl,
        color: TC.dim
      }
    }, "XP")), /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.dv,
        background: TC.sbg
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: S.si
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sv,
        color: fg
      }
    }, acc, "%"), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sl,
        color: TC.dim
      }
    }, "Accuracy")), /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.dv,
        background: TC.sbg
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: S.si
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sv,
        color: fg
      }
    }, data.totalAnswered), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sl,
        color: TC.dim
      }
    }, "Answered"))), nr && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: 6,
        background: TC.sbg,
        borderRadius: 3,
        overflow: "hidden",
        marginBottom: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        height: "100%",
        background: "linear-gradient(90deg,#667eea,#764ba2)",
        borderRadius: 3,
        width: Math.min((data.xp - rank.min) / (nr.min - rank.min) * 100, 100) + "%"
      }
    })), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: "#555"
      }
    }, nr.min - data.xp, " XP to ", nr.b, " ", nr.name)), dueC > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        startGame("SPACED_REVIEW", []);
      },
      style: {
        width: "100%",
        padding: 14,
        marginBottom: 14,
        background: "linear-gradient(135deg,rgba(102,126,234,.12),rgba(118,75,162,.12))",
        border: "1.5px solid rgba(102,126,234,.3)",
        borderRadius: 12,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "#667eea"
      }
    }, "\u{1F9E0}", " ", dueC, " due for review"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: TC.muted,
        marginTop: 2
      }
    }, "Spaced repetition")), (dueC > 0 || blindC > 0 || daysSinceCars >= 3 || weakC.length > 0) && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: TC.card,
        border: "1px solid " + TC.cbr,
        borderRadius: 12,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        fontWeight: 700,
        color: fg,
        marginBottom: 8
      }
    }, "\u{1F4CB}", " Today's Plan"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 6
      }
    }, dueC > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        startGame("SPACED_REVIEW", []);
      },
      style: {
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(102,126,234,.12)",
        border: "1px solid rgba(102,126,234,.25)",
        color: "#667eea"
      }
    }, "\u{1F9E0}", " ", dueC, " reviews due"), blindC > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        startGame("BLIND_SPOTS", []);
      },
      style: {
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(248,113,113,.1)",
        border: "1px solid rgba(248,113,113,.25)",
        color: "#f87171"
      }
    }, "\u{1F4A5}", " ", blindC, " blind spots"), daysSinceCars >= 3 && /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        startGame("CARS_MODE", []);
      },
      style: {
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(155,93,229,.1)",
        border: "1px solid rgba(155,93,229,.25)",
        color: "#9b5de5"
      }
    }, "\u{1F4D6}", " CARS (", daysSinceCars, "d ago)"), weakC.length > 0 && /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        startGame("WEAK_TOPICS", []);
      },
      style: {
        padding: "6px 10px",
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 600,
        background: "rgba(251,191,36,.1)",
        border: "1px solid rgba(251,191,36,.25)",
        color: "#fbbf24"
      }
    }, "\u{1F3AF}", " Weak topics"))), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setScr("study_cards");
      },
      style: {
        width: "100%",
        padding: 12,
        marginBottom: 8,
        background: "rgba(102,126,234,.06)",
        border: "1px solid rgba(102,126,234,.15)",
        borderRadius: 12,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "#667eea"
      }
    }, "\u{1F4D6}", " Study Cards"), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        color: TC.muted,
        marginLeft: 8
      }
    }, "30 concept mini-lessons")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setScr("section_pick");
      },
      style: {
        flex: 1,
        padding: 12,
        background: "rgba(255,150,50,.06)",
        border: "1px solid rgba(255,150,50,.15)",
        borderRadius: 12,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: "#ff9933"
      }
    }, "\u{1F3AF}", " Section Sim")), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setScr("reference");
      },
      style: {
        flex: 1,
        padding: 12,
        background: "rgba(74,222,128,.06)",
        border: "1px solid rgba(74,222,128,.15)",
        borderRadius: 12,
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 12,
        fontWeight: 700,
        color: "#4ade80"
      }
    }, "\u{1F4CB}", " Reference"))), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: S.sh
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sln,
        background: TC.sbg
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.stt,
        color: TC.dim
      }
    }, "MASTERY"), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sln,
        background: TC.sbg
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 4
      }
    }, Object.entries(CATS).filter(function (e) {
      return e[0] !== "CARS";
    }).map(function (e) {
      var k = e[0],
        cat = e[1],
        ac = getCatAcc(data, k),
        p = ac.pct || 0,
        c = p >= 80 ? "#4ade80" : p >= 60 ? "#fbbf24" : p > 0 ? "#f87171" : "#333";
      return /*#__PURE__*/React.createElement("div", {
        key: k,
        style: {
          padding: "6px 3px",
          background: TC.card,
          borderRadius: 6,
          textAlign: "center",
          borderBottom: "2px solid " + c,
          background: TC.card
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 13
        }
      }, cat.icon), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 7,
          color: TC.dim
        }
      }, cat.name), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: c
        }
      }, ac.seen > 0 ? p + "%" : "\u2014"));
    }))), /*#__PURE__*/React.createElement("div", {
      style: S.sh
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sln,
        background: TC.sbg
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.stt,
        color: TC.dim
      }
    }, "GAME MODES"), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sln,
        background: TC.sbg
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginBottom: 12
      }
    }, ["BLITZ", "MARATHON", "BOSS_BATTLE"].map(function (k) {
      return /*#__PURE__*/React.createElement("button", {
        key: k,
        style: {
          ...S.mc,
          background: TC.card,
          border: "1px solid " + TC.cbr
        },
        onClick: function () {
          setGM(k);
          setScr("select_cats");
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 20,
          width: 30,
          textAlign: "center"
        }
      }, MODES[k].icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: fg,
          display: "block"
        }
      }, MODES[k].name), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: "#666"
        }
      }, MODES[k].desc)));
    })), /*#__PURE__*/React.createElement("div", {
      style: S.sh
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sln,
        background: TC.sbg
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.stt,
        color: TC.dim
      }
    }, "SMART PRACTICE"), /*#__PURE__*/React.createElement("span", {
      style: {
        ...S.sln,
        background: TC.sbg
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        marginBottom: 12
      }
    }, [{
      k: "SPACED_REVIEW",
      n: dueC,
      l: dueC ? dueC + " due" : "Caught up!"
    }, {
      k: "TAG_PRACTICE",
      n: 1,
      l: ALL_TAGS.length + " concept tags"
    }, {
      k: "FLAGGED",
      n: flagC,
      l: flagC ? flagC + " flagged" : "Flag Qs during play"
    }, {
      k: "BLIND_SPOTS",
      n: blindC,
      l: blindC ? blindC + " confident but wrong" : "Great calibration!"
    }, {
      k: "HARD_QS",
      n: hardC,
      l: hardC ? hardC + " below 70%" : "Play more"
    }, {
      k: "NEW_QS",
      n: newC,
      l: newC ? newC + " unseen" : "All seen!"
    }, {
      k: "WEAK_TOPICS",
      n: weakC.length,
      l: weakC.length ? weakC.map(function (c) {
        return CATS[c.key].icon + (c.pct || 0) + "%";
      }).join(" ") : "Play more"
    }, {
      k: "INTERLEAVED",
      n: 1,
      l: "Random all-topic mix"
    }, {
      k: "CARS_MODE",
      n: carsC,
      l: carsC + " CARS Qs"
    }, {
      k: "REVIEW",
      n: missC,
      l: missC ? missC + " to review" : "None"
    }].map(function (x) {
      return /*#__PURE__*/React.createElement("button", {
        key: x.k,
        style: Object.assign({}, S.mc, {
          background: TC.card,
          border: "1px solid " + TC.cbr,
          opacity: x.n ? 1 : .4
        }),
        onClick: function () {
          if (!x.n) return;
          if (x.k === "TAG_PRACTICE") setScr("select_tag");else startGame(x.k, []);
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 18,
          width: 30,
          textAlign: "center"
        }
      }, MODES[x.k].icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: fg,
          display: "block"
        }
      }, MODES[x.k].name), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: x.n ? TC.muted : TC.dim
        }
      }, x.l)));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8
      }
    }, data.bestStreak > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        textAlign: "center",
        padding: 8,
        background: "rgba(255,150,50,.08)",
        borderRadius: 8,
        fontSize: 12,
        color: "#ffa033",
        fontWeight: 600
      }
    }, "\u{1F525}", " Best: ", data.bestStreak), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setScr("stats");
      },
      style: {
        flex: 1,
        padding: 8,
        background: "rgba(102,126,234,.1)",
        borderRadius: 8,
        fontSize: 12,
        color: "#667eea",
        fontWeight: 600
      }
    }, "\u{1F4CA}", " Stats")), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        marginTop: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 9,
        color: "#444"
      }
    }, QS.length, " Qs ", "\u2022", " ", ALL_TAGS.length, " tags ", "\u2022", " ", newC, " unseen"))));
  }

  // === TAG SELECT ===
  if (scr === "select_tag") {
    var tc = getTagCounts(data);
    var hySet = typeof HY_TAGS !== "undefined" ? HY_TAGS : [];
    var filtered = ALL_TAGS.filter(function (t) {
      return !tagSearch || t.toLowerCase().indexOf(tagSearch.toLowerCase()) >= 0;
    }).sort(function (a, b) {
      var aHy = hySet.indexOf(a) >= 0 ? 0 : 1;
      var bHy = hySet.indexOf(b) >= 0 ? 0 : 1;
      if (aHy !== bHy) return aHy - bHy;
      return a.localeCompare(b);
    });
    return /*#__PURE__*/React.createElement("div", {
      style: S.c
    }, /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...S.bk,
        color: TC.muted
      },
      onClick: function () {
        setScr("home");
        setTagSearch("");
      }
    }, "<", "- Back"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: fg,
        margin: "0 0 12px"
      }
    }, "\u{1F3F7}\uFE0F", " Practice by Concept"), /*#__PURE__*/React.createElement("input", {
      type: "text",
      value: tagSearch,
      onChange: function (e) {
        setTagSearch(e.target.value);
      },
      placeholder: "Search tags...",
      style: {
        width: "100%",
        padding: "10px 14px",
        background: TC.card,
        border: "1.5px solid " + TC.cbr,
        borderRadius: 8,
        color: fg,
        fontSize: 13,
        fontFamily: "inherit",
        outline: "none",
        marginBottom: 12
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexWrap: "wrap",
        gap: 6
      }
    }, filtered.map(function (tag) {
      var info = tc[tag] || {
        total: 0,
        seen: 0,
        correct: 0
      };
      var pct = info.seen > 0 ? Math.round(info.correct / info.seen * 100) : null;
      var c = pct === null ? "#555" : pct >= 80 ? "#4ade80" : pct >= 60 ? "#fbbf24" : "#f87171";
      var tier = getTagTier(data, tag);
      var stars = tier.tier >= 3 ? "\u2B50\u2B50\u2B50" : tier.tier >= 2 ? "\u2B50\u2B50" : tier.tier >= 1 ? "\u2B50" : "";
      var hasCard = typeof CARDS !== "undefined" && !!CARDS[tag];
      var trend = getTagTrend(data, tag);
      var trendIcon = trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : trend === "flat" ? "\u2192" : "";
      var trendColor = trend === "up" ? "#4ade80" : trend === "down" ? "#f87171" : "#888";
      var isHY = hySet.indexOf(tag) >= 0;
      return /*#__PURE__*/React.createElement("button", {
        key: tag,
        onClick: function () {
          setSelTag(tag);
          startGame("TAG_PRACTICE", [], tag);
          setTagSearch("");
        },
        style: {
          padding: "6px 12px",
          borderRadius: 16,
          fontSize: 11,
          fontWeight: 600,
          border: "1px solid " + (isHY ? "rgba(255,200,50,.3)" : "rgba(255,255,255,.1)"),
          background: isHY ? "rgba(255,200,50,.06)" : "rgba(255,255,255,.04)",
          color: fg
        }
      }, isHY && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          fontWeight: 800,
          color: "#ffc832",
          marginRight: 4,
          background: "rgba(255,200,50,.2)",
          padding: "1px 4px",
          borderRadius: 4
        }
      }, "HY"), hasCard ? "\u{1F4D6} " : "", tag, " ", /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9,
          color: c
        }
      }, pct !== null ? pct + "%" : info.total), stars && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          marginLeft: 3
        }
      }, stars), trendIcon && /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          fontWeight: 800,
          color: trendColor,
          marginLeft: 3
        }
      }, trendIcon));
    }))));
  }

  // === SECTION SIM PICKER ===
  if (scr === "section_pick") {
    var secs = ["Bio/Biochem", "Chem/Phys", "Psych/Soc", "CARS"];
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.c,
        background: bg,
        color: fg
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...S.bk,
        color: TC.muted
      },
      onClick: function () {
        setScr("home");
      }
    }, "<", "- Back"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: fg,
        margin: "0 0 4px"
      }
    }, "\u{1F3AF}", " Section Simulation"), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 11,
        color: TC.muted,
        marginBottom: 14,
        lineHeight: 1.5
      }
    }, "20 questions ", "\u2022", " 30 minutes ", "\u2022", " ~70% passage-based ", "\u2022", " No going back"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, secs.map(function (sec) {
      var a = getSectionAcc(data, sec);
      var c = a >= 80 ? "#4ade80" : a >= 60 ? "#fbbf24" : a !== null ? "#f87171" : "#555";
      return /*#__PURE__*/React.createElement("button", {
        key: sec,
        onClick: function () {
          startSectionSim(sec);
        },
        style: {
          padding: 16,
          background: TC.card,
          border: "1px solid " + TC.cbr,
          borderRadius: 12,
          textAlign: "left"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 14,
          fontWeight: 700,
          color: fg
        }
      }, sec), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 800,
          color: c
        }
      }, a !== null ? a + "%" : "--")));
    }))));
  }

  // === REFERENCE SHEETS ===
  if (scr === "reference") {
    var R = typeof REFS !== "undefined" ? REFS : {};
    var tStyle = {
      fontSize: 10 + fz,
      color: fg,
      lineHeight: 1.5
    };
    var thStyle = {
      fontSize: 9 + fz,
      fontWeight: 700,
      color: TC.muted,
      padding: "4px 6px",
      textAlign: "left",
      borderBottom: "1px solid " + TC.cbr
    };
    var tdStyle = {
      fontSize: 10 + fz,
      padding: "4px 6px",
      borderBottom: "1px solid " + TC.cbr,
      color: fg
    };
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.c,
        background: bg,
        color: fg
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...S.bk,
        color: TC.muted
      },
      onClick: function () {
        setScr("home");
      }
    }, "<", "- Back"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: fg,
        margin: "0 0 14px"
      }
    }, "\u{1F4CB}", " Quick Reference"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 2,
        marginBottom: 14,
        background: TC.sbg,
        padding: 3,
        borderRadius: 10,
        flexWrap: "wrap"
      }
    }, [["aa", "Amino Acids"], ["met", "Metabolism"], ["horm", "Hormones"], ["brain", "Brain"], ["eq", "Equations"]].map(function (e) {
      return /*#__PURE__*/React.createElement("button", {
        key: e[0],
        onClick: function () {
          setRefTab(e[0]);
        },
        style: {
          flex: "1 1 auto",
          padding: "7px 4px",
          borderRadius: 7,
          fontSize: 8 + fz,
          fontWeight: 600,
          background: refTab === e[0] ? "rgba(102,126,234,.25)" : "transparent",
          color: refTab === e[0] ? "#667eea" : TC.dim,
          minWidth: 0
        }
      }, e[1]);
    })), refTab === "aa" && R.aminoAcids && /*#__PURE__*/React.createElement("div", {
      style: {
        overflowX: "auto"
      }
    }, /*#__PURE__*/React.createElement("table", {
      style: {
        width: "100%",
        borderCollapse: "collapse"
      }
    }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
      style: thStyle
    }, "Name"), /*#__PURE__*/React.createElement("th", {
      style: thStyle
    }, "3L"), /*#__PURE__*/React.createElement("th", {
      style: thStyle
    }, "1L"), /*#__PURE__*/React.createElement("th", {
      style: thStyle
    }, "Type"), /*#__PURE__*/React.createElement("th", {
      style: thStyle
    }, "pKa"), /*#__PURE__*/React.createElement("th", {
      style: thStyle
    }, "Notes"))), /*#__PURE__*/React.createElement("tbody", null, R.aminoAcids.map(function (aa, i) {
      var tc2 = aa.type === "Positive" ? "#4ade80" : aa.type === "Negative" ? "#f87171" : aa.type === "Polar" ? "#60a5fa" : "#888";
      return /*#__PURE__*/React.createElement("tr", {
        key: i
      }, /*#__PURE__*/React.createElement("td", {
        style: tdStyle
      }, aa.name), /*#__PURE__*/React.createElement("td", {
        style: tdStyle
      }, aa.t), /*#__PURE__*/React.createElement("td", {
        style: {
          ...tdStyle,
          fontWeight: 700
        }
      }, aa.o), /*#__PURE__*/React.createElement("td", {
        style: {
          ...tdStyle,
          color: tc2,
          fontWeight: 600,
          fontSize: 9 + fz
        }
      }, aa.type), /*#__PURE__*/React.createElement("td", {
        style: tdStyle
      }, aa.pka), /*#__PURE__*/React.createElement("td", {
        style: {
          ...tdStyle,
          fontSize: 9 + fz,
          color: TC.muted
        }
      }, aa.note));
    })))), refTab === "met" && R.metabolism && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 8
      }
    }, R.metabolism.map(function (p, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: 10,
          background: TC.card,
          borderRadius: 10,
          border: "1px solid " + TC.cbr
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12 + fz,
          fontWeight: 700,
          color: "#667eea",
          marginBottom: 4
        }
      }, p.path), /*#__PURE__*/React.createElement("div", {
        style: {
          ...tStyle,
          fontSize: 9 + fz,
          color: TC.muted
        }
      }, /*#__PURE__*/React.createElement("b", null, "Location:"), " ", p.loc, " ", "\u2022", " ", /*#__PURE__*/React.createElement("b", null, "In:"), " ", p.input, " ", "\u2022", " ", /*#__PURE__*/React.createElement("b", null, "Out:"), " ", p.output), /*#__PURE__*/React.createElement("div", {
        style: {
          ...tStyle,
          fontSize: 9 + fz,
          color: TC.muted,
          marginTop: 2
        }
      }, /*#__PURE__*/React.createElement("b", null, "Key enzyme:"), " ", p.key), /*#__PURE__*/React.createElement("div", {
        style: {
          ...tStyle,
          fontSize: 9 + fz,
          color: TC.dim,
          marginTop: 2
        }
      }, p.reg));
    })), refTab === "horm" && R.hormones && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    }, R.hormones.map(function (h, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: 8,
          background: TC.card,
          borderRadius: 8,
          border: "1px solid " + TC.cbr
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11 + fz,
          fontWeight: 700,
          color: fg
        }
      }, h.hormone), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 9 + fz,
          color: TC.dim
        }
      }, h.gland)), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9 + fz,
          color: TC.muted,
          marginTop: 2
        }
      }, h.target, " ", "\u2022", " ", h.effect), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8 + fz,
          color: TC.dim,
          marginTop: 1
        }
      }, h.reg));
    })), refTab === "brain" && R.brain && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    }, R.brain.map(function (b, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: 8,
          background: TC.card,
          borderRadius: 8,
          border: "1px solid " + TC.cbr
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11 + fz,
          fontWeight: 700,
          color: fg
        }
      }, b.region), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9 + fz,
          color: TC.muted,
          marginTop: 2
        }
      }, b.func), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9 + fz,
          color: "#f87171",
          marginTop: 2
        }
      }, "Damage: ", b.damage));
    })), refTab === "eq" && R.equations && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    }, R.equations.map(function (e, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: 8,
          background: TC.card,
          borderRadius: 8,
          border: "1px solid " + TC.cbr,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10 + fz,
          fontWeight: 700,
          color: fg,
          whiteSpace: "nowrap",
          flexShrink: 0
        }
      }, e.name), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10 + fz,
          color: TC.muted,
          fontFamily: "inherit"
        }
      }, e.eq));
    }))));
  }

  // === STATS ===
  if (scr === "stats") {
    var cs = Object.entries(CATS).map(function (e) {
      return Object.assign({
        key: e[0]
      }, e[1], getCatAcc(data, e[0]));
    }).sort(function (a, b) {
      return (a.pct || 999) - (b.pct || 999);
    });
    var rec = data.sessionHistory.slice().reverse().slice(0, 10);
    var trend = data.sessionHistory.slice(-20).map(function (s, i) {
      return {
        i: i,
        pct: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0
      };
    });
    var cal = data.calibration || DD.calibration;
    var ct = data.catTiming || {};
    var badges = getBadges(data);
    var earnedBadges = badges.filter(function (b) {
      return b.done;
    }).length;
    return /*#__PURE__*/React.createElement("div", {
      style: S.c
    }, /*#__PURE__*/React.createElement(SB, null), /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...S.bk,
        color: TC.muted
      },
      onClick: function () {
        setScr("home");
      }
    }, "<", "- Back"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: fg,
        margin: "0 0 14px"
      }
    }, "\u{1F4CA}", " Stats"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 2,
        marginBottom: 14,
        background: TC.sbg,
        padding: 3,
        borderRadius: 10,
        flexWrap: "wrap"
      }
    }, [["overview", "Overview"], ["topics", "Topics"], ["pacing", "Pacing"], ["score", "Score"], ["badges", "Badges"], ["calibration", "Calibr."], ["history", "History"]].map(function (e) {
      return /*#__PURE__*/React.createElement("button", {
        key: e[0],
        onClick: function () {
          setSTab(e[0]);
        },
        style: {
          flex: "1 1 auto",
          padding: "7px 4px",
          borderRadius: 7,
          fontSize: 8,
          fontWeight: 600,
          background: sTab === e[0] ? "rgba(102,126,234,.25)" : "transparent",
          color: sTab === e[0] ? "#667eea" : TC.dim,
          minWidth: 0
        }
      }, e[1]);
    })), sTab === "overview" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 8,
        marginBottom: 14
      }
    }, [{
      l: "XP",
      v: data.xp
    }, {
      l: "Accuracy",
      v: acc + "%"
    }, {
      l: "Answered",
      v: data.totalAnswered
    }, {
      l: "Day Streak",
      v: dayStreak + "\u{1F525}"
    }, {
      l: "Badges",
      v: earnedBadges + "/" + badges.length
    }, {
      l: "Hints",
      v: data.hintsUsed || 0
    }].map(function (x, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: 10,
          background: TC.card,
          borderRadius: 10,
          border: "1px solid " + TC.cbr
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          color: TC.dim,
          textTransform: "uppercase",
          letterSpacing: 1
        }
      }, x.l), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 16,
          fontWeight: 800,
          color: fg
        }
      }, x.v));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 12,
        background: TC.card,
        borderRadius: 10,
        border: "1px solid " + TC.cbr,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: TC.dim,
        textTransform: "uppercase",
        letterSpacing: 1,
        marginBottom: 4
      }
    }, "Study Time"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 800,
        color: "#fff"
      }
    }, getStudyToday(data), "m"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 8,
        color: "#555"
      }
    }, "Today")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 800,
        color: "#fff"
      }
    }, fmtTime(getStudyWeek(data))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 8,
        color: "#555"
      }
    }, "This Week")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 14,
        fontWeight: 800,
        color: "#fff"
      }
    }, fmtTime(getStudyTotal(data))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 8,
        color: "#555"
      }
    }, "Total")))), trend.length > 1 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: "#777",
        fontWeight: 600,
        marginBottom: 6
      }
    }, "Session Trend"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        height: 50
      }
    }, trend.map(function (t, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-end",
          height: "100%"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          width: "100%",
          maxWidth: 16,
          background: t.pct >= 80 ? "#4ade80" : t.pct >= 60 ? "#fbbf24" : "#f87171",
          borderRadius: "2px 2px 0 0",
          height: Math.max(t.pct * .5, 3) + "%",
          minHeight: 2
        }
      }));
    }))), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        var txt = exportStats(data);
        try {
          navigator.clipboard.writeText(txt);
          alert("Stats copied to clipboard!");
        } catch (e) {
          prompt("Copy this:", txt);
        }
      },
      style: {
        display: "block",
        width: "100%",
        padding: 10,
        background: "rgba(102,126,234,.08)",
        border: "1px solid rgba(102,126,234,.2)",
        borderRadius: 8,
        fontSize: 11,
        fontWeight: 600,
        color: "#667eea",
        marginBottom: 8
      }
    }, "\u{1F4CB}", " Copy Stats to Clipboard")), sTab === "topics" && /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    }, cs.map(function (c) {
      return /*#__PURE__*/React.createElement("div", {
        key: c.key,
        style: {
          padding: 10,
          background: TC.card,
          borderRadius: 10,
          borderLeft: "3px solid " + c.color
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: fg
        }
      }, c.icon, " ", c.name), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 800,
          color: c.pct != null ? c.pct >= 80 ? "#4ade80" : c.pct >= 60 ? "#fbbf24" : "#f87171" : "#555"
        }
      }, c.pct != null ? c.pct + "%" : "\u2014")), /*#__PURE__*/React.createElement("div", {
        style: {
          height: 3,
          background: TC.sbg,
          borderRadius: 2,
          overflow: "hidden",
          marginTop: 4
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          height: "100%",
          width: (c.pct || 0) + "%",
          background: c.color
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          color: TC.dim,
          marginTop: 3
        }
      }, c.correct, "/", c.seen, " of ", QS.filter(function (q) {
        return q.cat === c.key;
      }).length));
    })), sTab === "pacing" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 11,
        color: "#999",
        marginBottom: 12,
        lineHeight: 1.5
      }
    }, "MCAT target: ~95s per question. Green = on pace. Yellow = fast. Red = slow."), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 10,
        background: TC.card,
        borderRadius: 10,
        border: "1px solid " + TC.cbr,
        marginBottom: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 9,
        color: TC.dim,
        textTransform: "uppercase",
        marginBottom: 4
      }
    }, "Study Time This Week"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: "#fff"
      }
    }, fmtTime(getStudyWeek(data)))), Object.entries(CATS).map(function (e) {
      var k = e[0],
        cat = e[1];
      var t = ct[k];
      if (!t || !t.count) return null;
      var avg = Math.round(t.total / t.count);
      var c = avg < 15 ? "#f87171" : avg > 180 ? "#f87171" : avg > 120 ? "#fbbf24" : "#4ade80";
      var label = avg < 15 ? "Too fast" : avg > 180 ? "Too slow" : avg > 120 ? "Slow" : "Good";
      var barW = Math.min(avg / 180 * 100, 100);
      return /*#__PURE__*/React.createElement("div", {
        key: k,
        style: {
          padding: 10,
          background: TC.card,
          borderRadius: 10,
          border: "1px solid " + TC.cbr,
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 600,
          color: fg
        }
      }, cat.icon, " ", cat.name), /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: "right"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 16,
          fontWeight: 800,
          color: c
        }
      }, avg, "s"), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          color: c,
          marginLeft: 4
        }
      }, label))), /*#__PURE__*/React.createElement("div", {
        style: {
          height: 4,
          background: TC.sbg,
          borderRadius: 2,
          overflow: "hidden",
          marginTop: 4,
          position: "relative"
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          position: "absolute",
          left: Math.round(95 / 180 * 100) + "%",
          top: 0,
          width: 1,
          height: 4,
          background: "rgba(255,255,255,.3)"
        }
      }), /*#__PURE__*/React.createElement("div", {
        style: {
          height: "100%",
          width: barW + "%",
          background: c,
          borderRadius: 2
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          color: TC.dim,
          marginTop: 2
        }
      }, t.count, " Qs ", "\u2022", " 95s target (white line)"));
    }).filter(Boolean), !Object.keys(ct).length && /*#__PURE__*/React.createElement("div", {
      style: {
        color: "#555",
        fontSize: 12,
        textAlign: "center",
        padding: 30
      }
    }, "Answer some questions to see pacing data")), sTab === "score" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 11,
        color: "#999",
        marginBottom: 12,
        lineHeight: 1.5
      }
    }, "Rough MCAT score estimate based on your accuracy. More accurate with more questions answered."), data.totalAnswered < 50 ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 20,
        textAlign: "center",
        color: "#555",
        fontSize: 12
      }
    }, "Answer at least 50 questions to see a score prediction.", "\n", "Currently: ", data.totalAnswered, "/50") : /*#__PURE__*/React.createElement("div", null, ["Bio/Biochem", "Chem/Phys", "Psych/Soc", "CARS"].map(function (sec) {
      var a = getSectionAcc(data, sec);
      var p = predictScore(a);
      var cats = Object.keys(CATS).filter(function (k) {
        return CATS[k].sec === sec;
      });
      var qs_count = cats.reduce(function (sum, k) {
        return sum + getCatAcc(data, k).seen;
      }, 0);
      return /*#__PURE__*/React.createElement("div", {
        key: sec,
        style: {
          padding: 12,
          background: TC.card,
          borderRadius: 10,
          border: "1px solid " + TC.cbr,
          marginBottom: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: "#fff"
        }
      }, sec), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          color: TC.dim,
          marginTop: 2
        }
      }, qs_count, " Qs answered")), /*#__PURE__*/React.createElement("div", {
        style: {
          textAlign: "right"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 18,
          fontWeight: 800,
          color: a >= 80 ? "#4ade80" : a >= 70 ? "#fbbf24" : a >= 60 ? "#fb923c" : "#f87171"
        }
      }, a !== null ? a + "%" : "--"), p && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: "#888"
        }
      }, p.low, "-", p.high))));
    }), function () {
      var tp = getTotalPredicted(data);
      return tp ? /*#__PURE__*/React.createElement("div", {
        style: {
          padding: 14,
          background: "linear-gradient(135deg,rgba(102,126,234,.1),rgba(118,75,162,.1))",
          border: "1.5px solid rgba(102,126,234,.3)",
          borderRadius: 12,
          textAlign: "center",
          marginTop: 4
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: "#888",
          marginBottom: 4
        }
      }, "Estimated Total Score"), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 28,
          fontWeight: 900,
          color: "#fff"
        }
      }, tp, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 14,
          color: "#555"
        }
      }, "/528"))) : null;
    }(), /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 9,
        color: "#555",
        marginTop: 10,
        textAlign: "center",
        lineHeight: 1.4
      }
    }, "Disclaimer: This is a rough estimate based on practice accuracy. Real MCAT scores depend on many factors including passage interpretation, timing, and test-day performance."))), sTab === "badges" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 11,
        color: "#999",
        marginBottom: 12
      }
    }, earnedBadges, "/", badges.length, " earned"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8
      }
    }, badges.map(function (b) {
      return /*#__PURE__*/React.createElement("div", {
        key: b.id,
        style: {
          padding: 10,
          background: b.done ? "rgba(74,222,128,.06)" : "rgba(255,255,255,.02)",
          border: "1px solid " + (b.done ? "rgba(74,222,128,.2)" : "rgba(255,255,255,.06)"),
          borderRadius: 10,
          opacity: b.done ? 1 : .5
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 20,
          marginBottom: 4
        }
      }, b.icon), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          fontWeight: 700,
          color: b.done ? "#4ade80" : "#555"
        }
      }, b.name), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: b.done ? "#888" : "#444",
          marginTop: 2
        }
      }, b.desc), b.done && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 8,
          color: "#4ade80",
          marginTop: 3
        }
      }, "\u2705", " Earned"));
    }))), sTab === "calibration" && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 11,
        color: "#999",
        marginBottom: 12,
        lineHeight: 1.5
      }
    }, "When you feel confident, are you actually right?"), [{
      k: "high",
      l: "Confident",
      c: "#4ade80",
      e: "\u{1F60E}"
    }, {
      k: "med",
      l: "Somewhat",
      c: "#fbbf24",
      e: "\u{1F914}"
    }, {
      k: "low",
      l: "Guessing",
      c: "#f87171",
      e: "\u{1F62C}"
    }].map(function (x) {
      var t = (cal[x.k] || {}).total || 0,
        co = (cal[x.k] || {}).correct || 0,
        pct = t > 0 ? Math.round(co / t * 100) : 0;
      return /*#__PURE__*/React.createElement("div", {
        key: x.k,
        style: {
          padding: 12,
          background: TC.card,
          borderRadius: 10,
          border: "1px solid " + TC.cbr,
          marginBottom: 8
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 600,
          color: fg
        }
      }, x.e, " ", x.l), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 14,
          fontWeight: 800,
          color: x.c
        }
      }, t > 0 ? pct + "%" : "\u2014")), /*#__PURE__*/React.createElement("div", {
        style: {
          height: 4,
          background: TC.sbg,
          borderRadius: 2,
          overflow: "hidden",
          marginTop: 4
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          height: "100%",
          width: pct + "%",
          background: x.c
        }
      })), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: TC.dim,
          marginTop: 3
        }
      }, co, "/", t));
    })), sTab === "history" && /*#__PURE__*/React.createElement("div", null, !rec.length ? /*#__PURE__*/React.createElement("div", {
      style: {
        color: "#555",
        fontSize: 12,
        textAlign: "center",
        padding: 30
      }
    }, "No sessions") : rec.map(function (s, i) {
      var p = s.total > 0 ? Math.round(s.correct / s.total * 100) : 0;
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: 10,
          background: TC.card,
          borderRadius: 10,
          border: "1px solid " + TC.cbr,
          marginBottom: 6
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between"
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: fg
        }
      }, (MODES[s.mode] || {}).icon, " ", (MODES[s.mode] || {}).name || s.mode), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 11,
          fontWeight: 800,
          color: p >= 80 ? "#4ade80" : p >= 60 ? "#fbbf24" : "#f87171"
        }
      }, p, "%")), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: TC.dim,
          marginTop: 3
        }
      }, new Date(s.date).toLocaleDateString(), " ", "\u2022", " ", s.correct, "/", s.total, " ", "\u2022", " +", s.score, "XP"));
    })), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        if (confirm("Reset ALL progress?")) {
          dirtyRef.current = true;
          setData(Object.assign({}, DD));
          setScr("home");
        }
      },
      style: {
        marginTop: 18,
        border: "1px solid rgba(248,113,113,.3)",
        color: "#f87171",
        padding: "8px 16px",
        borderRadius: 8,
        fontSize: 10,
        display: "block",
        margin: "18px auto 0"
      }
    }, "Reset Progress")));
  }

  // === CAT SELECT ===
  if (scr === "select_cats") {
    var secs = {};
    Object.entries(CATS).filter(function (e) {
      return e[0] !== "CARS";
    }).forEach(function (e) {
      if (!secs[e[1].sec]) secs[e[1].sec] = [];
      secs[e[1].sec].push(Object.assign({
        key: e[0]
      }, e[1]));
    });
    return /*#__PURE__*/React.createElement("div", {
      style: S.c
    }, /*#__PURE__*/React.createElement(SB, null), /*#__PURE__*/React.createElement("div", {
      style: S.i
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        ...S.bk,
        color: TC.muted
      },
      onClick: function () {
        setSelCats([]);
        setScr("home");
      }
    }, "<", "- Back"), /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: fg,
        margin: "0 0 12px"
      }
    }, MODES[gm].icon, " ", MODES[gm].name), Object.entries(secs).map(function (e) {
      return /*#__PURE__*/React.createElement("div", {
        key: e[0],
        style: {
          marginBottom: 12
        }
      }, /*#__PURE__*/React.createElement("h3", {
        style: {
          fontSize: 9,
          color: TC.dim,
          letterSpacing: 2,
          textTransform: "uppercase",
          marginBottom: 6
        }
      }, e[0]), /*#__PURE__*/React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))",
          gap: 5
        }
      }, e[1].map(function (c) {
        var is = selCats.indexOf(c.key) >= 0;
        return /*#__PURE__*/React.createElement("button", {
          key: c.key,
          onClick: function () {
            setSelCats(function (p) {
              return is ? p.filter(function (x) {
                return x !== c.key;
              }) : p.concat([c.key]);
            });
          },
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "8px 4px",
            borderRadius: 8,
            border: "1.5px solid " + (is ? c.color : TC.cbr),
            background: is ? c.color + "22" : TC.card
          }
        }, /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 16
          }
        }, c.icon), /*#__PURE__*/React.createElement("span", {
          style: {
            fontSize: 9,
            fontWeight: 600
          }
        }, c.name));
      })));
    }), /*#__PURE__*/React.createElement("button", {
      style: S.btn,
      onClick: function () {
        startGame(gm, selCats);
      }
    }, selCats.length === 0 ? "Start All" : "Start " + selCats.length + " topic" + (selCats.length > 1 ? "s" : ""))));
  }

  // === PLAY ===
  if (scr === "play") {
    var q = qs[qi];
    if (!q) {
      setScr("results");
      return null;
    }
    var cat = CATS[q.cat];
    var low = tl != null && tl <= 10;
    var passageData = q.pass ? PASSAGES[q.pass] : null;
    var isFlagged = (data.flagged || []).indexOf(q.id) >= 0;
    var isMatch = q.type === "match";
    var isTimed = MODES[gm] && MODES[gm].timed;
    var answeredCount = Object.keys(qAnswered).length;
    var totalCount = qs.length;

    // Pause overlay
    if (paused) return /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.c,
        background: bg,
        color: fg
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 48,
        marginBottom: 16
      }
    }, "\u23F8\uFE0F"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 18,
        fontWeight: 800,
        color: fg,
        marginBottom: 8
      }
    }, "Paused"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: "#888",
        marginBottom: 20
      }
    }, "Timer stopped at ", tl, "s"), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setPaused(false);
      },
      style: S.btn
    }, "Resume"))));
    return /*#__PURE__*/React.createElement("div", {
      style: Object.assign({}, S.c, {
        background: bg,
        color: fg
      }, flash ? {
        animation: "fG .5s"
      } : {}, shake ? {
        animation: "sS .4s"
      } : {})
    }, /*#__PURE__*/React.createElement(SB, null), /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "0 auto",
        padding: "10px 14px 2px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: 6
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: {
        background: TC.card,
        width: 28,
        height: 28,
        borderRadius: 7,
        fontSize: 13,
        color: TC.muted,
        flexShrink: 0
      },
      onClick: fin
    }, "\u2715"), isTimed && /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setPaused(true);
        clearTimeout(tr.current);
      },
      style: {
        background: TC.card,
        width: 28,
        height: 28,
        borderRadius: 7,
        fontSize: 11,
        color: TC.muted,
        flexShrink: 0
      }
    }, "\u23F8"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        toggleFlag(q.id);
      },
      style: {
        fontSize: 14,
        padding: "2px 6px",
        flexShrink: 0,
        color: TC.muted
      }
    }, isFlagged ? "\u{1F6A9}" : "\u2690"), streak >= 2 && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        color: "#ff9933",
        padding: "2px 6px",
        background: "rgba(255,153,51,.12)",
        borderRadius: 12,
        flexShrink: 0
      }
    }, "\u{1F525}", streak), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 10,
        fontWeight: 700,
        color: "#667eea",
        padding: "2px 6px",
        background: "rgba(102,126,234,.12)",
        borderRadius: 12,
        flexShrink: 0
      }
    }, "\u2B50", sScore)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 3,
        marginTop: 6,
        justifyContent: "center",
        flexWrap: "wrap"
      }
    }, qs.map(function (_, i) {
      var isAnswered = !!qAnswered[i];
      var isCurrent = i === qi;
      var canJump = gm !== "SECTION_SIM" && (!isAnswered || isCurrent);
      return /*#__PURE__*/React.createElement("button", {
        key: i,
        onClick: function () {
          if (canJump) goToQ(i);
        },
        disabled: !canJump,
        style: {
          width: isCurrent ? 12 : 8,
          height: isCurrent ? 12 : 8,
          borderRadius: "50%",
          border: isCurrent ? "2px solid #667eea" : "none",
          background: isAnswered ? "#4ade80" : isCurrent ? "#667eea" : TC.sbg,
          transition: "all .15s",
          opacity: canJump || isCurrent ? 1 : .4
        }
      });
    }))), gm === "SECTION_SIM" && simTimer != null && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        fontSize: 14,
        fontWeight: 800,
        maxWidth: 640,
        margin: "2px auto",
        color: simTimer < 300 ? "#ff4444" : simTimer < 600 ? "#fbbf24" : "#88ff88"
      }
    }, "\u23F1", " ", Math.floor(simTimer / 60), ":", (simTimer % 60 < 10 ? "0" : "") + simTimer % 60, " remaining"), tl != null && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        fontSize: 16,
        fontWeight: 800,
        maxWidth: 640,
        margin: "2px auto",
        color: low ? "#ff4444" : "#88ff88",
        animation: low ? "pu .8s infinite" : "none"
      }
    }, "\u23F1", " ", tl, "s"), gm === "BOSS_BATTLE" && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "center",
        display: "flex",
        justifyContent: "center",
        gap: 3,
        padding: "2px 0"
      }
    }, [0, 1, 2].map(function (i) {
      return /*#__PURE__*/React.createElement("span", {
        key: i,
        style: {
          fontSize: 16,
          opacity: i < lives ? 1 : .2
        }
      }, "\u2764\uFE0F");
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "0 auto",
        padding: "3px 14px 6px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "3px 10px",
        borderRadius: 14,
        fontSize: 9,
        fontWeight: 600,
        color: "#fff",
        background: cat.color
      }
    }, cat.icon, " ", cat.name), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: TC.dim
      }
    }, ["", "Easy", "Med", "Hard"][q.diff || 1]), isMatch && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: "#9b5de5"
      }
    }, "Matching"), q.pass && /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 8,
        color: "#9b5de5"
      }
    }, "Passage"), (q.tags || []).slice(0, 2).map(function (t) {
      return /*#__PURE__*/React.createElement("span", {
        key: t,
        style: {
          fontSize: 8,
          padding: "1px 6px",
          borderRadius: 10,
          background: "rgba(255,255,255,.05)",
          color: TC.dim
        }
      }, t);
    })), passageData && /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 14px 8px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "passage-box"
    }, passageData.text)), /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 14px 10px"
      }
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 16 + fz,
        fontWeight: 700,
        color: fg,
        lineHeight: 1.5,
        margin: 0
      }
    }, q.q)), isMatch && !sr && /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 14px"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 5
      }
    }, q.pairs.map(function (p, i) {
      var done = matchDone.indexOf(i) >= 0;
      var selected = matchSel === i;
      return /*#__PURE__*/React.createElement("button", {
        key: i,
        onClick: function () {
          handleMatchTap("left", i);
        },
        disabled: done,
        style: {
          padding: "10px",
          borderRadius: 8,
          fontSize: 11,
          textAlign: "left",
          border: "1.5px solid " + (selected ? "#667eea" : done ? "rgba(74,222,128,.3)" : "rgba(255,255,255,.1)"),
          background: selected ? "rgba(102,126,234,.15)" : done ? "rgba(74,222,128,.08)" : "rgba(255,255,255,.04)",
          opacity: done ? .5 : 1,
          color: "#fff",
          fontWeight: 600
        }
      }, p[0]);
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 5
      }
    }, q.shuffledRight.map(function (r, i) {
      var used = matchResults.some(function (mr) {
        return mr.right === r;
      });
      return /*#__PURE__*/React.createElement("button", {
        key: i,
        onClick: function () {
          handleMatchTap("right", i);
        },
        disabled: used || matchSel === null,
        style: {
          padding: "10px",
          borderRadius: 8,
          fontSize: 11,
          textAlign: "left",
          border: "1.5px solid " + (used ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.1)"),
          background: used ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.04)",
          opacity: used ? .4 : 1,
          color: used ? "#666" : "#ccc"
        }
      }, r);
    })))), isMatch && sr && /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "12px auto 0",
        padding: "0 14px 24px",
        animation: "sU .3s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 8
      }
    }, matchResults.every(function (r) {
      return r.correct;
    }) ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "#4ade80"
      }
    }, "\u2705", " All correct!") : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "#f87171"
      }
    }, "\u274C", " ", matchResults.filter(function (r) {
      return r.correct;
    }).length, "/", matchResults.length, " correct")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 8
      }
    }, matchResults.map(function (r, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          fontSize: 11,
          padding: "4px 0",
          color: r.correct ? "#4ade80" : "#f87171"
        }
      }, r.correct ? "\u2705" : "\u274C", " ", r.left, " ", "\u2192", " ", r.right, !r.correct ? " (should be: " + r.expected + ")" : "");
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: TC.card,
        borderRadius: 10,
        border: "1px solid " + TC.cbr,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 12,
        color: TC.muted,
        lineHeight: 1.8
      }
    }, q.ex)), q.mn && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "8px 12px",
        background: "rgba(255,200,50,.08)",
        borderRadius: 8,
        borderLeft: "3px solid #ffc832",
        fontSize: 11,
        color: "#ffd866",
        marginBottom: 8,
        lineHeight: 1.5,
        fontWeight: 600
      }
    }, "\u{1F4A1}", " ", q.mn), /*#__PURE__*/React.createElement("button", {
      onClick: nextQ,
      style: S.btn
    }, answeredCount >= totalCount ? "See Results" : "Next")), !isMatch && /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6
      }
    }, q.o.map(function (opt, i) {
      var isEliminated = eliminated.indexOf(i) >= 0;
      var bg2 = TC.card,
        bc2 = TC.cbr,
        op = 1;
      if (sr) {
        if (i === q.a) {
          bg2 = "rgba(74,222,128,.12)";
          bc2 = "#4ade80";
        } else if (i === sel && i !== q.a) {
          bg2 = "rgba(248,113,113,.12)";
          bc2 = "#f87171";
        } else op = 0.4;
      } else if (awaitConf && i === sel) {
        bg2 = "rgba(102,126,234,.15)";
        bc2 = "#667eea";
      } else if (!awaitConf && i === sel) {
        bg2 = "rgba(102,126,234,.08)";
        bc2 = "rgba(102,126,234,.5)";
      } else if (isEliminated) {
        op = 0.2;
      }
      return /*#__PURE__*/React.createElement("button", {
        key: qi + "-" + i,
        style: {
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "10px 11px",
          background: bg2,
          border: "1.5px solid " + bc2,
          borderRadius: 9,
          textAlign: "left",
          opacity: op,
          width: "100%"
        },
        onClick: function () {
          if (!isEliminated) handleAnswer(i);
        },
        disabled: sr || awaitConf || isEliminated
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          width: 20,
          height: 20,
          borderRadius: 5,
          background: TC.sbg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          color: TC.muted,
          flexShrink: 0
        }
      }, String.fromCharCode(65 + i)), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12,
          lineHeight: 1.5,
          textDecoration: isEliminated ? "line-through" : "none"
        }
      }, opt));
    })), !isMatch && !sr && !awaitConf && sel === null && !hintUsed && eliminated.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "8px auto 0",
        padding: "0 14px"
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: useHint,
      style: {
        padding: "10px 16px",
        background: "rgba(255,200,50,.1)",
        border: "1px solid rgba(255,200,50,.25)",
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 600,
        color: "#ffc832",
        whiteSpace: "nowrap",
        color: "#ffc832"
      }
    }, "\u{1F4A1}", " 50/50")), !isMatch && sel !== null && !sr && !awaitConf && /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "8px auto 0",
        padding: "0 14px",
        animation: "sU .2s"
      }
    }, !hintUsed && eliminated.length === 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("button", {
      onClick: useHint,
      style: {
        padding: "6px 12px",
        background: "rgba(255,200,50,.1)",
        border: "1px solid rgba(255,200,50,.25)",
        borderRadius: 8,
        fontSize: 10,
        fontWeight: 600,
        color: "#ffc832"
      }
    }, "\u{1F4A1}", " 50/50")), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: TC.muted,
        marginBottom: 6,
        textAlign: "center"
      }
    }, "How confident? (submits answer)"), /*#__PURE__*/React.createElement("div", {
      className: "conf-bar"
    }, /*#__PURE__*/React.createElement("button", {
      className: "conf-btn",
      onClick: function () {
        setAwaitConf(true);
        clearTimeout(tr.current);
        commitAnswer("low");
      }
    }, "\u{1F62C}", " Guessing"), /*#__PURE__*/React.createElement("button", {
      className: "conf-btn",
      onClick: function () {
        setAwaitConf(true);
        clearTimeout(tr.current);
        commitAnswer("med");
      }
    }, "\u{1F914}", " Somewhat"), /*#__PURE__*/React.createElement("button", {
      className: "conf-btn",
      onClick: function () {
        setAwaitConf(true);
        clearTimeout(tr.current);
        commitAnswer("high");
      }
    }, "\u{1F60E}", " Confident"))), !isMatch && sr && /*#__PURE__*/React.createElement("div", {
      style: {
        maxWidth: 640,
        margin: "10px auto 0",
        padding: "0 14px 24px",
        animation: "sU .3s"
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        marginBottom: 8
      }
    }, sel === q.a ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "#4ade80"
      }
    }, "\u2705", " Correct!", hintUsed ? " (hint used, 50% XP)" : "") : /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: "#f87171"
      }
    }, "\u274C", " ", tl === 0 && sel === null ? "Time's up!" : "Incorrect")), /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "8px 12px",
        background: "rgba(74,222,128,.1)",
        border: "1px solid rgba(74,222,128,.25)",
        borderRadius: 8,
        marginBottom: 8,
        fontSize: 12,
        fontWeight: 700,
        color: "#4ade80"
      }
    }, "\u2705", " ", q.o[q.a]), sel !== q.a && thinkDelay > 0 ? /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "16px",
        textAlign: "center",
        background: TC.card,
        borderRadius: 10,
        border: "1px solid " + TC.cbr,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 13,
        color: "#fbbf24",
        fontWeight: 600,
        marginBottom: 6
      }
    }, "Why is this correct? Take a moment to think..."), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 24,
        fontWeight: 800,
        color: "#fbbf24"
      }
    }, thinkDelay)) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: TC.card,
        borderRadius: 10,
        border: "1px solid " + TC.cbr,
        marginBottom: 8
      }
    }, /*#__PURE__*/React.createElement("p", {
      style: {
        fontSize: 12,
        color: TC.muted,
        lineHeight: 1.8,
        margin: 0
      }
    }, q.ex)), q.mn && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "8px 12px",
        background: "rgba(255,200,50,.08)",
        borderRadius: 8,
        borderLeft: "3px solid #ffc832",
        fontSize: 11,
        color: "#ffd866",
        marginBottom: 8,
        lineHeight: 1.5,
        fontWeight: 600
      }
    }, "\u{1F4A1}", " ", q.mn), /*#__PURE__*/React.createElement("button", {
      onClick: nextQ,
      style: S.btn
    }, answeredCount >= totalCount ? "See Results" : "Next"))));
  }

  // === RESULTS ===
  if (scr === "results") {
    var pct = sTotal > 0 ? Math.round(sCorrect / sTotal * 100) : 0;
    var grade = pct >= 90 ? "S" : pct >= 80 ? "A" : pct >= 70 ? "B" : pct >= 60 ? "C" : "D";
    var gc = {
      S: "#ffd700",
      A: "#4ade80",
      B: "#60a5fa",
      C: "#fb923c",
      D: "#f87171"
    }[grade];
    var simUsed = gm === "SECTION_SIM" && simTimer !== null ? 1800 - simTimer : null;
    return /*#__PURE__*/React.createElement("div", {
      style: {
        ...S.c,
        background: bg,
        color: fg
      }
    }, /*#__PURE__*/React.createElement(SB, null), /*#__PURE__*/React.createElement("div", {
      style: Object.assign({}, S.i, {
        textAlign: "center"
      })
    }, /*#__PURE__*/React.createElement("h2", {
      style: {
        fontSize: 16 + fz,
        fontWeight: 800,
        color: fg,
        marginBottom: 14
      }
    }, (MODES[gm] || {}).icon, " ", (MODES[gm] || {}).name, simSection ? " (" + simSection + ")" : "", " Complete!"), /*#__PURE__*/React.createElement("div", {
      style: {
        width: 90,
        height: 90,
        borderRadius: "50%",
        border: "3px solid " + gc,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 auto 16px",
        animation: "gI .6s"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 32,
        fontWeight: 900,
        color: gc
      }
    }, grade)), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        justifyContent: "center",
        gap: 18,
        marginBottom: 18
      }
    }, [{
      n: sCorrect + "/" + sTotal,
      l: "Correct"
    }, {
      n: pct + "%",
      l: "Accuracy"
    }, {
      n: "+" + sScore,
      l: "XP"
    }].map(function (x, i) {
      return /*#__PURE__*/React.createElement("div", {
        key: i
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 18,
          fontWeight: 800,
          color: fg,
          display: "block"
        }
      }, x.n), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 8,
          color: TC.dim,
          textTransform: "uppercase"
        }
      }, x.l));
    })), gm === "SECTION_SIM" && simSection && /*#__PURE__*/React.createElement("div", {
      style: {
        padding: 12,
        background: "rgba(102,126,234,.08)",
        border: "1px solid rgba(102,126,234,.2)",
        borderRadius: 10,
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: TC.muted
      }
    }, "Section: ", simSection), simUsed && /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: TC.muted
      }
    }, "Time used: ", Math.floor(simUsed / 60), "m ", simUsed % 60, "s of 30:00"), function () {
      var p2 = predictScore(pct);
      return p2 ? /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 12,
          fontWeight: 700,
          color: "#667eea",
          marginTop: 4
        }
      }, "Est. section score: ", p2.low, "-", p2.high) : null;
    }()), wrong.length > 0 && /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: "left",
        marginBottom: 14
      }
    }, /*#__PURE__*/React.createElement("h3", {
      style: {
        fontSize: 13,
        fontWeight: 700,
        color: fg,
        marginBottom: 8
      }
    }, "\u{1F4DD}", " Review (", wrong.length, ")"), wrong.map(function (wq, i) {
      var wFlagged = (data.flagged || []).indexOf(wq.id) >= 0;
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        style: {
          padding: 9,
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.06)",
          borderRadius: 8,
          marginBottom: 5
        }
      }, /*#__PURE__*/React.createElement("div", {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 4
        }
      }, /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 10,
          color: TC.muted,
          lineHeight: 1.4,
          flex: 1
        }
      }, wq.q), /*#__PURE__*/React.createElement("button", {
        onClick: function () {
          toggleFlag(wq.id);
        },
        style: {
          fontSize: 14,
          padding: "2px 6px",
          flexShrink: 0,
          marginLeft: 6
        }
      }, wFlagged ? "\u{1F6A9}" : "\u2690")), wq.type !== "match" && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 10,
          color: "#4ade80",
          fontWeight: 600,
          marginBottom: 3,
          padding: "4px 8px",
          background: "rgba(74,222,128,.08)",
          borderRadius: 5
        }
      }, "\u2705", " ", wq.o[wq.a]), /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 11,
          color: TC.muted,
          lineHeight: 1.7
        }
      }, wq.ex), wq.mn && /*#__PURE__*/React.createElement("div", {
        style: {
          fontSize: 9,
          color: "#ffd866",
          marginTop: 4,
          padding: "4px 8px",
          background: "rgba(255,200,50,.06)",
          borderRadius: 5,
          borderLeft: "2px solid #ffc832"
        }
      }, "\u{1F4A1}", " ", wq.mn));
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        gap: 8,
        justifyContent: "center"
      }
    }, /*#__PURE__*/React.createElement("button", {
      style: Object.assign({}, S.btn, {
        width: "auto",
        padding: "11px 18px"
      }),
      onClick: function () {
        startGame(gm, selCats, selTag);
      }
    }, "Play Again"), /*#__PURE__*/React.createElement("button", {
      onClick: function () {
        setScr("home");
      },
      style: {
        padding: "11px 18px",
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.1)",
        borderRadius: 10,
        fontSize: 12,
        fontWeight: 700,
        color: "#aaa"
      }
    }, "Home"))));
  }
  return null;
}
function App() {
  var s = useState(null);
  if (!s[0]) return /*#__PURE__*/React.createElement(PinScreen, {
    onLogin: function (p, d) {
      s[1]({
        pin: p,
        data: d
      });
    }
  });
  return /*#__PURE__*/React.createElement(Game, {
    pin: s[0].pin,
    initialData: s[0].data
  });
}
const S = {
  c: {
    minHeight: "100vh",
    fontFamily: "inherit",
    overflowX: "hidden"
  },
  i: {
    maxWidth: 640,
    margin: "0 auto",
    padding: "24px 16px 40px"
  },
  t: {
    fontSize: 30,
    fontWeight: 900,
    color: "#fff",
    margin: 0,
    letterSpacing: 4
  },
  a: {
    background: "linear-gradient(135deg,#667eea,#764ba2)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent"
  },
  sb: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "11px 12px",
    background: "rgba(255,255,255,.04)",
    borderRadius: 11,
    border: "1px solid rgba(255,255,255,.06)",
    marginBottom: 14,
    flexWrap: "wrap"
  },
  si: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2
  },
  sv: {
    fontSize: 12,
    fontWeight: 700,
    color: "#fff"
  },
  sl: {
    fontSize: 7,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1
  },
  dv: {
    width: 1,
    height: 24,
    background: "rgba(255,255,255,.08)"
  },
  sh: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 10
  },
  sln: {
    flex: 1,
    height: 1,
    background: "rgba(255,255,255,.08)"
  },
  stt: {
    fontSize: 8,
    color: "#555",
    letterSpacing: 3,
    fontWeight: 600
  },
  mc: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px",
    background: "rgba(255,255,255,.04)",
    border: "1px solid rgba(255,255,255,.08)",
    borderRadius: 10,
    textAlign: "left",
    width: "100%"
  },
  btn: {
    display: "block",
    width: "100%",
    padding: 12,
    marginTop: 10,
    background: "linear-gradient(135deg,#667eea,#764ba2)",
    color: "#fff",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1
  },
  bk: {
    color: "#888",
    fontSize: 11,
    padding: "3px 0",
    marginBottom: 10
  }
};
class EB extends React.Component {
  constructor(p) {
    super(p);
    this.state = {
      e: null
    };
  }
  static getDerivedStateFromError(e) {
    return {
      e: e.message
    };
  }
  render() {
    if (this.state.e) return React.createElement("div", {
      style: {
        padding: 40,
        color: "#f87171",
        background: "#0f0f14",
        minHeight: "100vh",
        fontFamily: "monospace"
      }
    }, React.createElement("h2", null, "Error"), React.createElement("pre", {
      style: {
        whiteSpace: "pre-wrap",
        fontSize: 12,
        marginTop: 12,
        color: "#ccc"
      }
    }, this.state.e));
    return this.props.children;
  }
}
try {
  ReactDOM.render(React.createElement(EB, null, React.createElement(App)), document.getElementById("root"));
} catch (e) {
  document.getElementById("root").innerHTML = '<div style="padding:40px;color:#f87171;font-family:monospace"><h2>Error</h2><pre>' + e.message + '</pre></div>';
}