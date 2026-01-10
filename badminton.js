/* Badminton Hosting App (static prototype)
   - Persists to localStorage
   - Roles: participant (read-only), host, admin
*/

(() => {
  const STORAGE_KEY = "badmintonHostingApp.v1";
  const SESSION_KEY = "badmintonHostingApp.session.v1";

  const DEFAULT_CODES = {
    host: "1111",
    admin: "9999",
  };

  /** @type {HTMLSelectElement} */
  const roleSelect = /** @type {any} */ (document.getElementById("roleSelect"));
  const logoutBtn = document.getElementById("logoutBtn");

  const authCard = document.getElementById("authCard");
  /** @type {HTMLInputElement} */
  const accessCode = /** @type {any} */ (document.getElementById("accessCode"));
  const loginBtn = document.getElementById("loginBtn");

  /** @type {HTMLSelectElement} */
  const categorySelect = /** @type {any} */ (document.getElementById("categorySelect"));
  /** @type {HTMLSelectElement} */
  const participantTeamSelect = /** @type {any} */ (document.getElementById("participantTeamSelect"));

  const categorySummary = document.getElementById("categorySummary");
  const teamsList = document.getElementById("teamsList");
  const standingsTable = document.getElementById("standingsTable");
  const matchesList = document.getElementById("matchesList");

  const createCategoryBtn = document.getElementById("createCategoryBtn");
  const addTeamBtn = document.getElementById("addTeamBtn");
  const generateMatchesBtn = document.getElementById("generateMatchesBtn");
  const startNextMatchBtn = document.getElementById("startNextMatchBtn");

  const livePanel = document.getElementById("livePanel");
  const liveStatusPill = document.getElementById("liveStatusPill");

  const exportBtn = document.getElementById("exportBtn");
  const importInput = /** @type {HTMLInputElement} */ (document.getElementById("importInput"));
  const resetDataBtn = document.getElementById("resetDataBtn");

  /** @type {HTMLDialogElement} */
  const modal = /** @type {any} */ (document.getElementById("modal"));
  const modalTitle = document.getElementById("modalTitle");
  const modalBody = document.getElementById("modalBody");
  const modalActions = document.getElementById("modalActions");

  /** @typedef {{ id: string, name: string, players: string[] }} Team */
  /** @typedef {{ id: string, teamAId: string, teamBId: string, status: 'scheduled'|'live'|'completed', scoreA: number, scoreB: number, winnerTeamId: string|null, startedAt: number|null, completedAt: number|null }} Match */
  /** @typedef {{ pointsToWin: number, winBy: number }} CategorySettings */
  /** @typedef {{ id: string, name: string, createdAt: number, settings: CategorySettings, teams: Team[], matches: Match[], winnerTeamId: string|null }} Category */
  /** @typedef {{ version: number, updatedAt: number, categories: Category[] }} AppState */
  /** @typedef {{ role: 'participant'|'host'|'admin', authedRole: 'participant'|'host'|'admin', selectedCategoryId: string|null, selectedTeamId: string|null }} SessionState */

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function now() {
    return Date.now();
  }

  function byId(list, id) {
    return list.find((x) => x.id === id) || null;
  }

  function clampMin0(n) {
    return Math.max(0, n);
  }

  function escapeText(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getSession() {
    /** @type {SessionState} */
    const fallback = {
      role: "participant",
      authedRole: "participant",
      selectedCategoryId: null,
      selectedTeamId: null,
    };
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return { ...fallback, ...parsed };
    } catch {
      return fallback;
    }
  }

  function setSession(next) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }

  function can(roleNeeded) {
    const s = getSession();
    if (s.authedRole === "admin") return true;
    if (roleNeeded === "participant") return true;
    return s.authedRole === roleNeeded;
  }

  function normalizePlayers(input) {
    return String(input)
      .split(/[\n,]/g)
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 6);
  }

  /** @returns {AppState} */
  function seedState() {
    const men = uid("cat");
    const women = uid("cat");

    const t1 = { id: uid("team"), name: "Smash Bros", players: ["Aman", "Rohit"] };
    const t2 = { id: uid("team"), name: "Net Ninjas", players: ["Vijay", "Karan"] };
    const t3 = { id: uid("team"), name: "Drop Shots", players: ["Riya", "Neha"] };
    const t4 = { id: uid("team"), name: "Court Queens", players: ["Pooja", "Isha"] };

    /** @type {AppState} */
    const st = {
      version: 1,
      updatedAt: now(),
      categories: [
        {
          id: men,
          name: "Men Doubles",
          createdAt: now(),
          settings: { pointsToWin: 21, winBy: 2 },
          teams: [t1, t2],
          matches: [],
          winnerTeamId: null,
        },
        {
          id: women,
          name: "Women Doubles",
          createdAt: now(),
          settings: { pointsToWin: 21, winBy: 2 },
          teams: [t3, t4],
          matches: [],
          winnerTeamId: null,
        },
      ],
    };
    // pre-generate matches for demo
    st.categories.forEach((c) => {
      c.matches = generateRoundRobinMatches(c);
    });
    return st;
  }

  /** @returns {AppState} */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeded = seedState();
        saveState(seeded);
        return seeded;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.categories)) throw new Error("bad state");
      return parsed;
    } catch {
      const seeded = seedState();
      saveState(seeded);
      return seeded;
    }
  }

  /** @param {AppState} st */
  function saveState(st) {
    st.updatedAt = now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
  }

  /** @param {Category} c */
  function generateRoundRobinMatches(c) {
    const teams = c.teams;
    /** @type {Match[]} */
    const matches = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matches.push({
          id: uid("match"),
          teamAId: teams[i].id,
          teamBId: teams[j].id,
          status: "scheduled",
          scoreA: 0,
          scoreB: 0,
          winnerTeamId: null,
          startedAt: null,
          completedAt: null,
        });
      }
    }
    return matches;
  }

  /** @param {Category} c */
  function computeStandings(c) {
    /** @type {Record<string, {teamId:string, name:string, played:number, wins:number, losses:number, pointsFor:number, pointsAgainst:number, diff:number, pts:number}>} */
    const rows = {};
    c.teams.forEach((t) => {
      rows[t.id] = {
        teamId: t.id,
        name: t.name,
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        diff: 0,
        pts: 0,
      };
    });

    for (const m of c.matches) {
      if (m.status !== "completed" || !m.winnerTeamId) continue;
      const a = rows[m.teamAId];
      const b = rows[m.teamBId];
      if (!a || !b) continue;
      a.played++;
      b.played++;
      a.pointsFor += m.scoreA;
      a.pointsAgainst += m.scoreB;
      b.pointsFor += m.scoreB;
      b.pointsAgainst += m.scoreA;
      if (m.winnerTeamId === m.teamAId) {
        a.wins++;
        b.losses++;
      } else {
        b.wins++;
        a.losses++;
      }
    }

    for (const tId of Object.keys(rows)) {
      const r = rows[tId];
      r.diff = r.pointsFor - r.pointsAgainst;
      r.pts = r.wins * 2;
    }

    const list = Object.values(rows).sort((x, y) => {
      if (y.pts !== x.pts) return y.pts - x.pts;
      if (y.diff !== x.diff) return y.diff - x.diff;
      if (y.pointsFor !== x.pointsFor) return y.pointsFor - x.pointsFor;
      return x.name.localeCompare(y.name);
    });

    return list.map((r, idx) => ({ ...r, rank: idx + 1 }));
  }

  function recomputeCategoryWinnerIfDone(st, categoryId) {
    const c = byId(st.categories, categoryId);
    if (!c) return;
    const allDone = c.matches.length > 0 && c.matches.every((m) => m.status === "completed");
    if (!allDone) {
      c.winnerTeamId = null;
      return;
    }
    const standings = computeStandings(c);
    c.winnerTeamId = standings[0]?.teamId || null;
  }

  function setRoleUI() {
    const s = getSession();
    roleSelect.value = s.role;

    // show auth card if role needs auth and not authed for that role
    const needsAuth = s.role === "host" || s.role === "admin";
    const isAuthed = s.authedRole === s.role || s.authedRole === "admin";
    authCard.hidden = !(needsAuth && !isAuthed);

    // gate buttons
    const gated = document.querySelectorAll("[data-requires]");
    gated.forEach((el) => {
      const need = el.getAttribute("data-requires");
      if (!need) return;
      const ok = can(/** @type {any} */ (need));
      el.toggleAttribute("hidden", !ok);
    });
  }

  function openModal(title, bodyNode, actionsNode) {
    modalTitle.textContent = title;
    modalBody.innerHTML = "";
    modalActions.innerHTML = "";
    if (bodyNode) modalBody.appendChild(bodyNode);
    if (actionsNode) modalActions.appendChild(actionsNode);
    modal.showModal();
  }

  function button(text, className, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = className;
    b.textContent = text;
    b.addEventListener("click", onClick);
    return b;
  }

  function render() {
    setRoleUI();
    const st = loadState();
    const s = getSession();

    // ensure selected category exists
    if (!s.selectedCategoryId || !byId(st.categories, s.selectedCategoryId)) {
      s.selectedCategoryId = st.categories[0]?.id || null;
      setSession(s);
    }

    const c = s.selectedCategoryId ? byId(st.categories, s.selectedCategoryId) : null;
    if (c && (!s.selectedTeamId || !byId(c.teams, s.selectedTeamId))) {
      s.selectedTeamId = c.teams[0]?.id || null;
      setSession(s);
    }

    // categories select
    categorySelect.innerHTML = "";
    if (st.categories.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "No categories yet";
      categorySelect.appendChild(opt);
      categorySelect.disabled = true;
    } else {
      categorySelect.disabled = false;
      for (const cat of st.categories) {
        const opt = document.createElement("option");
        opt.value = cat.id;
        const winner = cat.winnerTeamId ? byId(cat.teams, cat.winnerTeamId)?.name : null;
        opt.textContent = winner ? `${cat.name} — Winner: ${winner}` : cat.name;
        if (cat.id === s.selectedCategoryId) opt.selected = true;
        categorySelect.appendChild(opt);
      }
    }

    // participant team select
    participantTeamSelect.innerHTML = "";
    if (!c) {
      participantTeamSelect.disabled = true;
    } else {
      participantTeamSelect.disabled = false;
      for (const t of c.teams) {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name;
        if (t.id === s.selectedTeamId) opt.selected = true;
        participantTeamSelect.appendChild(opt);
      }
      if (c.teams.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No teams yet";
        participantTeamSelect.appendChild(opt);
      }
    }

    // summary
    categorySummary.innerHTML = "";
    if (!c) {
      categorySummary.innerHTML = `<div class="muted">Create a category to get started.</div>`;
    } else {
      const standings = computeStandings(c);
      const winnerName = c.winnerTeamId ? byId(c.teams, c.winnerTeamId)?.name : null;
      const live = c.matches.find((m) => m.status === "live") || null;
      const doneCount = c.matches.filter((m) => m.status === "completed").length;
      const total = c.matches.length;
      const selectedTeam = s.selectedTeamId ? byId(c.teams, s.selectedTeamId) : null;
      const myRow = s.selectedTeamId ? standings.find((r) => r.teamId === s.selectedTeamId) : null;

      const parts = [];
      parts.push(`<div><strong>${escapeText(c.name)}</strong></div>`);
      parts.push(
        `<div class="muted">Rules: First to ${c.settings.pointsToWin}, win by ${c.settings.winBy}. Matches: ${doneCount}/${total} completed.</div>`
      );
      if (live) {
        const ta = byId(c.teams, live.teamAId)?.name || "Team A";
        const tb = byId(c.teams, live.teamBId)?.name || "Team B";
        parts.push(`<div class="muted">Live: <strong>${escapeText(ta)}</strong> vs <strong>${escapeText(tb)}</strong></div>`);
      }
      if (winnerName) {
        parts.push(`<div>Winner: <strong>${escapeText(winnerName)}</strong></div>`);
      } else if (total > 0 && doneCount === total) {
        parts.push(`<div>Winner: <strong>—</strong> (no teams)</div>`);
      } else {
        parts.push(`<div class="muted">Winner will appear after all matches are completed.</div>`);
      }

      if (getSession().role === "participant" && selectedTeam && myRow) {
        parts.push(
          `<div style="margin-top:8px"><strong>Your team:</strong> ${escapeText(selectedTeam.name)} — Rank <strong>#${myRow.rank}</strong> (W ${myRow.wins} / L ${myRow.losses})</div>`
        );
      }

      categorySummary.innerHTML = parts.join("");
    }

    // teams list
    teamsList.innerHTML = "";
    if (!c || c.teams.length === 0) {
      teamsList.innerHTML = `<div class="muted">No teams yet.</div>`;
    } else {
      for (const t of c.teams) {
        const el = document.createElement("div");
        el.className = "item";
        const players = t.players.length ? t.players.map(escapeText).join(", ") : "—";
        el.innerHTML = `
          <div class="item__head">
            <div>
              <div class="item__title">${escapeText(t.name)}</div>
              <div class="item__sub">Players: ${players}</div>
            </div>
            <div class="item__actions">
              ${can("host") ? `<button class="btn btn--ghost btn--sm" data-action="editTeam" data-id="${t.id}">Edit</button>` : ""}
            </div>
          </div>
        `;
        teamsList.appendChild(el);
      }
    }

    // standings table
    standingsTable.innerHTML = "";
    if (!c || c.teams.length === 0) {
      standingsTable.innerHTML = `<div class="muted">Standings will appear once teams exist.</div>`;
    } else {
      const standings = computeStandings(c);
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>L</th>
            <th>PF</th>
            <th>PA</th>
            <th>+/-</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          ${standings
            .map((r) => {
              const isMine = getSession().role === "participant" && r.teamId === getSession().selectedTeamId;
              return `
                <tr style="${isMine ? "background: rgba(110,231,255,.08);" : ""}">
                  <td><strong>#${r.rank}</strong></td>
                  <td>${escapeText(r.name)}</td>
                  <td>${r.played}</td>
                  <td>${r.wins}</td>
                  <td>${r.losses}</td>
                  <td>${r.pointsFor}</td>
                  <td>${r.pointsAgainst}</td>
                  <td>${r.diff}</td>
                  <td><strong>${r.pts}</strong></td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      `;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      wrap.appendChild(table);
      standingsTable.appendChild(wrap);
    }

    // matches list (participant sees all, but highlighted + compact context)
    matchesList.innerHTML = "";
    if (!c || c.matches.length === 0) {
      matchesList.innerHTML = `<div class="muted">No matches yet. Host can generate matches once teams are added.</div>`;
    } else {
      const myTeam = getSession().selectedTeamId;
      for (const m of c.matches) {
        const ta = byId(c.teams, m.teamAId)?.name || "Team A";
        const tb = byId(c.teams, m.teamBId)?.name || "Team B";
        const winner = m.winnerTeamId ? byId(c.teams, m.winnerTeamId)?.name : null;

        const isMine = myTeam && (m.teamAId === myTeam || m.teamBId === myTeam);
        const pillClass =
          m.status === "live" ? "pill pill--warn" : m.status === "completed" ? "pill pill--ok" : "pill";
        const pillText = m.status === "live" ? "LIVE" : m.status === "completed" ? "COMPLETED" : "SCHEDULED";

        const el = document.createElement("div");
        el.className = "item";
        el.style.background = isMine ? "rgba(110,231,255,.08)" : "";
        el.innerHTML = `
          <div class="item__head">
            <div>
              <div class="item__title">${escapeText(ta)} <span class="muted">vs</span> ${escapeText(tb)}</div>
              <div class="item__sub">
                <span class="${pillClass}">${pillText}</span>
                <span class="muted" style="margin-left:8px">Score: <strong>${m.scoreA}</strong> - <strong>${m.scoreB}</strong></span>
                ${winner ? `<span class="muted" style="margin-left:8px">Winner: <strong>${escapeText(winner)}</strong></span>` : ""}
              </div>
            </div>
            <div class="item__actions">
              ${can("host") && m.status === "scheduled" ? `<button class="btn btn--primary btn--sm" data-action="startMatch" data-id="${m.id}">Start</button>` : ""}
              ${can("host") && m.status === "live" ? `<button class="btn btn--ghost btn--sm" data-action="openLive" data-id="${m.id}">Open</button>` : ""}
              ${can("admin") ? `<button class="btn btn--ghost btn--sm" data-action="editMatch" data-id="${m.id}">Edit</button>` : ""}
            </div>
          </div>
        `;
        matchesList.appendChild(el);
      }
    }

    // live panel
    const liveMatch = c ? c.matches.find((m) => m.status === "live") || null : null;
    livePanel.innerHTML = "";
    if (!c || !liveMatch) {
      liveStatusPill.textContent = "No live match";
      liveStatusPill.className = "pill";
      livePanel.innerHTML = `<div class="muted">Host can start a match to enable live scoring.</div>`;
    } else {
      const ta = byId(c.teams, liveMatch.teamAId);
      const tb = byId(c.teams, liveMatch.teamBId);
      liveStatusPill.textContent = "LIVE";
      liveStatusPill.className = "pill pill--warn";

      const panel = document.createElement("div");
      panel.className = "live";

      const title = document.createElement("div");
      title.innerHTML = `<div class="muted">Scoring: first to <strong>${c.settings.pointsToWin}</strong>, win by <strong>${c.settings.winBy}</strong>.</div>`;
      panel.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "scorebox";
      grid.appendChild(renderTeamScoreCard(c, liveMatch, "A", ta, tb));
      grid.appendChild(renderTeamScoreCard(c, liveMatch, "B", tb, ta));
      panel.appendChild(grid);

      const actions = document.createElement("div");
      actions.className = "row row--wrap";
      actions.appendChild(
        button("End match", "btn btn--primary", () => {
          if (!can("host")) return;
          const st2 = loadState();
          const c2 = byId(st2.categories, c.id);
          if (!c2) return;
          const m2 = byId(c2.matches, liveMatch.id);
          if (!m2 || m2.status !== "live") return;
          const winnerId = computeWinner(c2, m2);
          if (!winnerId) {
            alert("No winner yet. Ensure someone reaches the target AND wins by required margin (or adjust score).");
            return;
          }
          m2.status = "completed";
          m2.winnerTeamId = winnerId;
          m2.completedAt = now();
          recomputeCategoryWinnerIfDone(st2, c2.id);
          saveState(st2);
          render();
        })
      );
      actions.appendChild(
        button("Cancel live (back to scheduled)", "btn btn--ghost", () => {
          if (!can("admin")) return;
          const st2 = loadState();
          const c2 = byId(st2.categories, c.id);
          if (!c2) return;
          const m2 = byId(c2.matches, liveMatch.id);
          if (!m2 || m2.status !== "live") return;
          m2.status = "scheduled";
          m2.scoreA = 0;
          m2.scoreB = 0;
          m2.winnerTeamId = null;
          m2.startedAt = null;
          m2.completedAt = null;
          c2.winnerTeamId = null;
          saveState(st2);
          render();
        })
      );
      panel.appendChild(actions);

      livePanel.appendChild(panel);
    }
  }

  function renderTeamScoreCard(category, match, side, team, opponent) {
    const node = document.createElement("div");
    node.className = "teamcard";
    const name = team?.name || (side === "A" ? "Team A" : "Team B");
    const players = team?.players?.length ? team.players.join(", ") : "—";
    const score = side === "A" ? match.scoreA : match.scoreB;

    node.innerHTML = `
      <div class="teamcard__name">${escapeText(name)}</div>
      <div class="teamcard__players">Players: ${escapeText(players)}</div>
      <div class="score">
        <div class="score__value" aria-label="score">${score}</div>
        <div class="score__controls" data-side="${side}">
          ${can("host") ? `
            <button class="btn btn--ghost btn--sm" data-action="score" data-delta="-1" data-side="${side}">-1</button>
            <button class="btn btn--primary btn--sm" data-action="score" data-delta="1" data-side="${side}">+1</button>
            <button class="btn btn--ghost btn--sm" data-action="score" data-delta="2" data-side="${side}">+2</button>
          ` : `<div class="muted">Read only</div>`}
        </div>
      </div>
    `;
    return node;
  }

  /** @param {Category} c @param {Match} m */
  function computeWinner(c, m) {
    const a = m.scoreA;
    const b = m.scoreB;
    const pt = c.settings.pointsToWin;
    const winBy = c.settings.winBy;
    const aOk = a >= pt && a - b >= winBy;
    const bOk = b >= pt && b - a >= winBy;
    if (aOk && !bOk) return m.teamAId;
    if (bOk && !aOk) return m.teamBId;
    return null;
  }

  function ensureOnlyOneLive(category) {
    const live = category.matches.filter((m) => m.status === "live");
    if (live.length <= 1) return;
    // keep most recently started; demote others (admin-only repair path)
    live.sort((x, y) => (y.startedAt || 0) - (x.startedAt || 0));
    for (let i = 1; i < live.length; i++) {
      live[i].status = "scheduled";
      live[i].scoreA = 0;
      live[i].scoreB = 0;
      live[i].winnerTeamId = null;
      live[i].startedAt = null;
      live[i].completedAt = null;
    }
  }

  // ---------- events ----------

  roleSelect.addEventListener("change", () => {
    const s = getSession();
    s.role = /** @type {any} */ (roleSelect.value);
    // moving to participant always allowed
    if (s.role === "participant") s.authedRole = "participant";
    setSession(s);
    accessCode.value = "";
    render();
  });

  loginBtn.addEventListener("click", () => {
    const s = getSession();
    const role = s.role;
    if (role !== "host" && role !== "admin") return;
    const code = accessCode.value.trim();
    if (code && code === DEFAULT_CODES[role]) {
      s.authedRole = role;
      setSession(s);
      accessCode.value = "";
      render();
      return;
    }
    alert("Incorrect code.");
  });

  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem(SESSION_KEY);
    render();
  });

  categorySelect.addEventListener("change", () => {
    const s = getSession();
    s.selectedCategoryId = categorySelect.value || null;
    s.selectedTeamId = null;
    setSession(s);
    render();
  });

  participantTeamSelect.addEventListener("change", () => {
    const s = getSession();
    s.selectedTeamId = participantTeamSelect.value || null;
    setSession(s);
    render();
  });

  createCategoryBtn.addEventListener("click", () => {
    if (!can("host")) return;
    const body = document.createElement("div");
    body.innerHTML = `
      <div class="row row--wrap">
        <div class="field">
          <label class="label" for="newCatName">Category name</label>
          <input id="newCatName" class="input" placeholder="e.g. Mixed Doubles" />
        </div>
        <div class="field">
          <label class="label" for="newCatPoints">Points to win</label>
          <input id="newCatPoints" class="input" inputmode="numeric" value="21" />
        </div>
        <div class="field">
          <label class="label" for="newCatWinBy">Win by</label>
          <input id="newCatWinBy" class="input" inputmode="numeric" value="2" />
        </div>
      </div>
      <div class="muted">Tip: You can add teams next, then generate matches.</div>
    `;
    const actions = document.createElement("div");
    actions.appendChild(
      button("Create", "btn btn--primary", () => {
        const name = /** @type {HTMLInputElement} */ (document.getElementById("newCatName")).value.trim();
        const points = parseInt(/** @type {HTMLInputElement} */ (document.getElementById("newCatPoints")).value, 10);
        const winBy = parseInt(/** @type {HTMLInputElement} */ (document.getElementById("newCatWinBy")).value, 10);
        if (!name) return alert("Category name is required.");
        const st = loadState();
        const cat = {
          id: uid("cat"),
          name,
          createdAt: now(),
          settings: { pointsToWin: Number.isFinite(points) ? points : 21, winBy: Number.isFinite(winBy) ? winBy : 2 },
          teams: [],
          matches: [],
          winnerTeamId: null,
        };
        st.categories.unshift(cat);
        saveState(st);
        const s = getSession();
        s.selectedCategoryId = cat.id;
        s.selectedTeamId = null;
        setSession(s);
        modal.close();
        render();
      })
    );
    openModal("Create category", body, actions);
  });

  addTeamBtn.addEventListener("click", () => {
    if (!can("host")) return;
    const st = loadState();
    const s = getSession();
    const c = s.selectedCategoryId ? byId(st.categories, s.selectedCategoryId) : null;
    if (!c) return alert("Select a category first.");

    const body = document.createElement("div");
    body.innerHTML = `
      <div class="row row--wrap">
        <div class="field">
          <label class="label" for="newTeamName">Team name</label>
          <input id="newTeamName" class="input" placeholder="e.g. Net Ninjas" />
        </div>
      </div>
      <div class="field">
        <label class="label" for="newTeamPlayers">Players (comma or new line separated)</label>
        <textarea id="newTeamPlayers" placeholder="Player 1, Player 2"></textarea>
      </div>
    `;
    const actions = document.createElement("div");
    actions.appendChild(
      button("Add team", "btn btn--primary", () => {
        const name = /** @type {HTMLInputElement} */ (document.getElementById("newTeamName")).value.trim();
        const players = normalizePlayers(/** @type {HTMLTextAreaElement} */ (document.getElementById("newTeamPlayers")).value);
        if (!name) return alert("Team name is required.");
        const st2 = loadState();
        const c2 = byId(st2.categories, c.id);
        if (!c2) return;
        c2.teams.push({ id: uid("team"), name, players });
        // matches likely need regeneration if already generated
        c2.winnerTeamId = null;
        saveState(st2);
        modal.close();
        render();
      })
    );
    openModal("Add team", body, actions);
  });

  generateMatchesBtn.addEventListener("click", () => {
    if (!can("host")) return;
    const st = loadState();
    const s = getSession();
    const c = s.selectedCategoryId ? byId(st.categories, s.selectedCategoryId) : null;
    if (!c) return alert("Select a category first.");
    if (c.teams.length < 2) return alert("Add at least 2 teams.");
    const ok = confirm("Generate a fresh round-robin schedule? This will replace existing matches for this category.");
    if (!ok) return;
    c.matches = generateRoundRobinMatches(c);
    c.winnerTeamId = null;
    saveState(st);
    render();
  });

  startNextMatchBtn.addEventListener("click", () => {
    if (!can("host")) return;
    const st = loadState();
    const s = getSession();
    const c = s.selectedCategoryId ? byId(st.categories, s.selectedCategoryId) : null;
    if (!c) return alert("Select a category first.");
    ensureOnlyOneLive(c);
    const existingLive = c.matches.find((m) => m.status === "live");
    if (existingLive) return alert("A match is already live. End it before starting another.");
    const next = c.matches.find((m) => m.status === "scheduled");
    if (!next) return alert("No scheduled matches left.");
    next.status = "live";
    next.startedAt = now();
    next.scoreA = 0;
    next.scoreB = 0;
    next.winnerTeamId = null;
    next.completedAt = null;
    c.winnerTeamId = null;
    saveState(st);
    render();
  });

  exportBtn.addEventListener("click", () => {
    if (!can("admin")) return;
    const st = loadState();
    const blob = new Blob([JSON.stringify(st, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `badminton-data-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener("change", async () => {
    if (!can("admin")) return;
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      if (!parsed || !Array.isArray(parsed.categories)) throw new Error("Invalid file format.");
      const ok = confirm("Import will replace current local data. Continue?");
      if (!ok) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      importInput.value = "";
      render();
    } catch (e) {
      alert(`Import failed: ${e?.message || e}`);
    }
  });

  resetDataBtn.addEventListener("click", () => {
    if (!can("admin")) return;
    const ok = confirm("Reset ALL app data in this browser? (Cannot be undone)");
    if (!ok) return;
    localStorage.removeItem(STORAGE_KEY);
    render();
  });

  // delegation for teams/matches actions + live scoring
  document.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const action = target?.getAttribute?.("data-action");
    if (!action) return;

    const st = loadState();
    const s = getSession();
    const c = s.selectedCategoryId ? byId(st.categories, s.selectedCategoryId) : null;
    if (!c) return;

    if (action === "editTeam") {
      if (!can("host")) return;
      const id = target.getAttribute("data-id");
      const t = id ? byId(c.teams, id) : null;
      if (!t) return;

      const body = document.createElement("div");
      body.innerHTML = `
        <div class="row row--wrap">
          <div class="field">
            <label class="label" for="editTeamName">Team name</label>
            <input id="editTeamName" class="input" value="${escapeText(t.name)}" />
          </div>
        </div>
        <div class="field">
          <label class="label" for="editTeamPlayers">Players</label>
          <textarea id="editTeamPlayers">${escapeText(t.players.join(", "))}</textarea>
        </div>
        <div class="muted">Note: If matches already exist, editing team names won’t change match history.</div>
      `;
      const actions = document.createElement("div");
      actions.appendChild(
        button("Save", "btn btn--primary", () => {
          const name = /** @type {HTMLInputElement} */ (document.getElementById("editTeamName")).value.trim();
          const players = normalizePlayers(/** @type {HTMLTextAreaElement} */ (document.getElementById("editTeamPlayers")).value);
          if (!name) return alert("Team name is required.");
          const st2 = loadState();
          const c2 = byId(st2.categories, c.id);
          if (!c2) return;
          const t2 = byId(c2.teams, t.id);
          if (!t2) return;
          t2.name = name;
          t2.players = players;
          saveState(st2);
          modal.close();
          render();
        })
      );
      openModal("Edit team", body, actions);
      return;
    }

    if (action === "startMatch") {
      if (!can("host")) return;
      const id = target.getAttribute("data-id");
      const m = id ? byId(c.matches, id) : null;
      if (!m) return;
      ensureOnlyOneLive(c);
      const existingLive = c.matches.find((x) => x.status === "live");
      if (existingLive) return alert("A match is already live. End it before starting another.");
      m.status = "live";
      m.startedAt = now();
      m.scoreA = 0;
      m.scoreB = 0;
      m.winnerTeamId = null;
      m.completedAt = null;
      c.winnerTeamId = null;
      saveState(st);
      render();
      return;
    }

    if (action === "openLive") {
      // just scroll to live panel
      document.getElementById("liveCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "editMatch") {
      if (!can("admin")) return;
      const id = target.getAttribute("data-id");
      const m = id ? byId(c.matches, id) : null;
      if (!m) return;

      const ta = byId(c.teams, m.teamAId)?.name || "Team A";
      const tb = byId(c.teams, m.teamBId)?.name || "Team B";
      const body = document.createElement("div");
      body.innerHTML = `
        <div class="muted">${escapeText(ta)} vs ${escapeText(tb)}</div>
        <div class="row row--wrap" style="margin-top:10px">
          <div class="field">
            <label class="label" for="editScoreA">Score (A)</label>
            <input id="editScoreA" class="input" inputmode="numeric" value="${m.scoreA}" />
          </div>
          <div class="field">
            <label class="label" for="editScoreB">Score (B)</label>
            <input id="editScoreB" class="input" inputmode="numeric" value="${m.scoreB}" />
          </div>
          <div class="field">
            <label class="label" for="editStatus">Status</label>
            <select id="editStatus" class="select">
              <option value="scheduled">scheduled</option>
              <option value="live">live</option>
              <option value="completed">completed</option>
            </select>
          </div>
        </div>
      `;
      const actions = document.createElement("div");
      actions.appendChild(
        button("Save", "btn btn--primary", () => {
          const scoreA = parseInt(/** @type {HTMLInputElement} */ (document.getElementById("editScoreA")).value, 10);
          const scoreB = parseInt(/** @type {HTMLInputElement} */ (document.getElementById("editScoreB")).value, 10);
          const status = /** @type {HTMLSelectElement} */ (document.getElementById("editStatus")).value;

          const st2 = loadState();
          const c2 = byId(st2.categories, c.id);
          if (!c2) return;
          const m2 = byId(c2.matches, m.id);
          if (!m2) return;

          m2.scoreA = clampMin0(Number.isFinite(scoreA) ? scoreA : 0);
          m2.scoreB = clampMin0(Number.isFinite(scoreB) ? scoreB : 0);
          m2.status = /** @type {any} */ (status);
          if (m2.status === "scheduled") {
            m2.winnerTeamId = null;
            m2.startedAt = null;
            m2.completedAt = null;
          }
          if (m2.status === "live") {
            m2.winnerTeamId = null;
            m2.startedAt = m2.startedAt || now();
            m2.completedAt = null;
          }
          if (m2.status === "completed") {
            const w = computeWinner(c2, m2);
            m2.winnerTeamId = w;
            m2.completedAt = m2.completedAt || now();
          }
          ensureOnlyOneLive(c2);
          recomputeCategoryWinnerIfDone(st2, c2.id);
          saveState(st2);
          modal.close();
          render();
        })
      );
      openModal("Edit match", body, actions);
      // set status value after insert
      /** @type {HTMLSelectElement} */ (document.getElementById("editStatus")).value = m.status;
      return;
    }

    if (action === "score") {
      if (!can("host")) return;
      const delta = parseInt(target.getAttribute("data-delta") || "0", 10);
      const side = target.getAttribute("data-side");
      if (!side || !Number.isFinite(delta)) return;

      const live = c.matches.find((m) => m.status === "live");
      if (!live) return;
      if (side === "A") live.scoreA = clampMin0(live.scoreA + delta);
      if (side === "B") live.scoreB = clampMin0(live.scoreB + delta);

      saveState(st);
      render();
      return;
    }
  });

  // initialize
  setRoleUI();
  render();
})();

