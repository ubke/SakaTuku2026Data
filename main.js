// アプリの状態
let players = JSON.parse(localStorage.getItem('sakatsuku_players')) || [];
let teams = JSON.parse(localStorage.getItem('sakatsuku_teams')) || ['初期チーム'];
let currentTeam = teams[0]; // 現在選択されているチーム

let currentPaintColor = 'red'; 
let currentPhase = '安定期';

// SortableJSを管理する変数
let sortableInstance = null;
let teamSortableInstance = null; // チームタブ用のSortableJS管理変数

const PITCH_POSITIONS = [
    'LW', 'CF', 'RW',
    'LM', 'AM', 'RM',
    'DM',
    'LB', 'CB', 'RB',
    'GK'
];

document.addEventListener('DOMContentLoaded', () => {
    migrateOldData(); // 古いデータへの対応
    initTabs();       // ★タブの初期化
    initPositions();
    initPitchGrid();
    initPalette();
    initPhases();
    renderPlayers();

    document.getElementById('toggleFormBtn').addEventListener('click', toggleForm);
    document.getElementById('savePlayerBtn').addEventListener('click', addPlayer);
});

// ★追加：過去に保存した選手（チーム未所属）を「初期チーム」に割り当てる処理
function migrateOldData() {
    let migrated = false;
    players.forEach(p => {
        if (!p.team) {
            p.team = teams[0];
            migrated = true;
        }
    });
    if (migrated) {
        localStorage.setItem('sakatsuku_players', JSON.stringify(players));
    }
}

// チームタブの生成とドラッグ＆ドロップ制御
function initTabs() {
    const container = document.getElementById('teamTabsContainer');
    container.innerHTML = '';

    // ★工夫ポイント：タブだけを入れる「並び替え専用の枠」を作成する
    const tabsWrapper = document.createElement('div');
    tabsWrapper.style.display = 'flex'; // 横並びを維持

    teams.forEach(team => {
        const tab = document.createElement('div');
        tab.className = `team-tab ${team === currentTeam ? 'active' : ''}`;
        tab.textContent = team;
        tab.dataset.team = team; // ★裏側にチーム名を記録しておく（並び替え保存用）
        
        tab.addEventListener('click', () => {
            currentTeam = team;
            initTabs(); 
            renderPlayers(); 
            const form = document.getElementById('addPlayerForm');
            if (form.style.display === 'block') toggleForm();
        });
        tabsWrapper.appendChild(tab);
    });

    // 並び替え枠をコンテナに追加
    container.appendChild(tabsWrapper);

    // ★追加ボタンの作成（並び替え枠の「外」に置くことで、ドラッグに巻き込まれないようにする）
    const addBtn = document.createElement('div');
    addBtn.className = 'add-team-btn';
    addBtn.textContent = '＋ 新規クラブ';
    addBtn.addEventListener('click', () => {
        const newTeam = prompt('新しく就任するクラブ名を入力してください:', '');
        if (newTeam && newTeam.trim() !== '' && !teams.includes(newTeam)) {
            teams.push(newTeam.trim());
            localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
            currentTeam = newTeam.trim(); 
            initTabs();
            renderPlayers();
        } else if (teams.includes(newTeam)) {
            alert('そのクラブは既に存在します！');
        }
    });
    container.appendChild(addBtn);

    // ★チームタブ専用のSortableJS設定
    if (teamSortableInstance) teamSortableInstance.destroy(); // 古い設定をリセット
    
    teamSortableInstance = new Sortable(tabsWrapper, {
        animation: 200,
        ghostClass: 'team-tab-ghost', // さきほどCSSで作ったデザイン
        direction: 'horizontal', // 横方向のドラッグを最適化
        
        // 並び替えが終わった瞬間の処理
        onEnd: function () {
            // 画面上の新しいタブの順番を取得して、データの配列を上書きする
            const newTeams = Array.from(tabsWrapper.children).map(tab => tab.dataset.team);
            teams = newTeams;
            localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
        }
    });
}

function initPositions() {
    const optionsList = document.getElementById('posOptionsList');
    const hiddenInput = document.getElementById('pPos');
    const trigger = document.getElementById('posSelectTrigger');
    const label = document.getElementById('posSelectLabel');
    const wrapper = document.getElementById('posSelectWrapper');
    
    optionsList.innerHTML = ''; 

    GAME_DATA.positions.forEach((pos, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'custom-option';
        optionDiv.textContent = `${pos.id} (${pos.name})`;
        optionDiv.style.backgroundColor = pos.color;

        optionDiv.addEventListener('click', function() {
            hiddenInput.value = pos.id;
            label.textContent = `${pos.id} (${pos.name})`;
            trigger.style.backgroundColor = pos.color;
            trigger.style.color = 'white';
            wrapper.classList.remove('open');

            document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(c => {
                c.removeAttribute('data-apt');
            });

            const cell = document.querySelector(`.pitch-cell[data-pos="${pos.id}"]`);
            if (cell) cell.setAttribute('data-apt', 'red');
        });

        optionsList.appendChild(optionDiv);

        if (index === 0) {
            hiddenInput.value = pos.id;
            label.textContent = `${pos.id} (${pos.name})`;
            trigger.style.backgroundColor = pos.color;
            trigger.style.color = 'white';
        }
    });

    trigger.addEventListener('click', function(e) {
        wrapper.classList.toggle('open');
        e.stopPropagation();
    });

    document.addEventListener('click', function(e) {
        if (!wrapper.contains(e.target)) wrapper.classList.remove('open');
    });
}

function initPitchGrid() {
    const grid = document.getElementById('formPitchGrid');
    grid.innerHTML = '';

    PITCH_POSITIONS.forEach(pos => {
        const cell = document.createElement('div');
        cell.className = 'pitch-cell';
        cell.dataset.pos = pos;
        cell.textContent = pos;
        
        cell.addEventListener('click', () => {
            if (currentPaintColor === 'none') {
                cell.removeAttribute('data-apt');
            } else {
                if (cell.getAttribute('data-apt') === currentPaintColor) {
                    cell.removeAttribute('data-apt');
                } else {
                    cell.setAttribute('data-apt', currentPaintColor);
                }
            }
        });
        grid.appendChild(cell);
    });
}

function initPalette() {
    const btns = document.querySelectorAll('.palette-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentPaintColor = btn.dataset.color;
        });
    });
}

function initPhases() {
    const btns = document.querySelectorAll('.phase-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            currentPhase = btn.dataset.phase;
        });
    });
}

function toggleForm() {
    const form = document.getElementById('addPlayerForm');
    const btn = document.getElementById('toggleFormBtn');
    
    if (form.style.display === 'none' || form.style.display === '') {
        form.style.display = 'block';
        btn.textContent = '× キャンセル';
        btn.style.backgroundColor = '#EF4444';
        btn.style.boxShadow = '0 4px 0 #B91C1C';
    } else {
        form.style.display = 'none';
        btn.textContent = `＋ ${currentTeam} に選手を登録`; // ★ボタンのテキストも変更
        btn.style.backgroundColor = 'var(--accent-cyan)';
        btn.style.boxShadow = '0 4px 0 #0891B2';
    }
}

// 選手の保存処理
function addPlayer() {
    const name = document.getElementById('pName').value;
    const pos = document.getElementById('pPos').value;
    const skillsStr = document.getElementById('pSkills').value;

    if (!name) {
        alert('選手名を入力してください');
        return;
    }

    const skillsArray = skillsStr.split(',').map(s => s.trim()).filter(s => s !== "");

    const aptitudes = {};
    document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(cell => {
        if (cell.dataset.pos && cell.dataset.apt) {
            aptitudes[cell.dataset.pos] = cell.dataset.apt;
        }
    });

    const newPlayer = {
        id: Date.now(),
        name: name,
        position: pos,
        skills: skillsArray,
        aptitudes: aptitudes,
        phase: currentPhase,
        team: currentTeam // ★追加：現在選択中のチーム名を保存
    };

    players.push(newPlayer);
    localStorage.setItem('sakatsuku_players', JSON.stringify(players));
    
    document.getElementById('pName').value = '';
    document.getElementById('pSkills').value = '';
    document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(c => c.removeAttribute('data-apt'));
    
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.phase-btn[data-phase="安定期"]').classList.add('selected');
    currentPhase = '安定期';

    toggleForm();
    renderPlayers();
}

window.deletePlayer = function(id) {
    if(confirm('この選手を削除しますか？')) {
        players = players.filter(p => p.id !== id);
        localStorage.setItem('sakatsuku_players', JSON.stringify(players));
        renderPlayers();
    }
};

/// 選手リストの描画とドラッグ＆ドロップ設定
function renderPlayers() {
    const list = document.getElementById('playerList');
    list.innerHTML = '';

    const targetPlayers = players.filter(player => player.team === currentTeam);

    if (targetPlayers.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: #9CA3AF;">${currentTeam} にはまだ選手が登録されていません。</div>`;
        // ★選手がいない時はドラッグ機能をオフにする
        if (sortableInstance) sortableInstance.destroy();
        return;
    }

    targetPlayers.forEach(player => {
        const tagsHtml = player.skills.map(skill => `<span class="tag">${skill}</span>`).join('');
        const posData = GAME_DATA.positions.find(p => p.id === player.position);
        const posColor = posData ? posData.color : '#9CA3AF'; 
        const posName = posData ? posData.id : player.position;
        const phaseName = player.phase || '未設定';

        let miniMapHtml = '<div class="mini-pitch">';
        PITCH_POSITIONS.forEach(pos => {
            const aptColor = (player.aptitudes && player.aptitudes[pos]) ? player.aptitudes[pos] : '';
            miniMapHtml += `<div class="mini-cell" data-pos="${pos}" data-apt="${aptColor}"></div>`;
        });
        miniMapHtml += '</div>';

        const card = document.createElement('div');
        card.className = 'player-card';
        // ドラッグした時に「誰が移動したか」を判定するため、カードの裏側にIDを仕込んでおく
        card.dataset.id = player.id; 

        card.innerHTML = `
            <div class="card-header">
                <div class="player-pos" style="background-color: ${posColor};">${posName}</div>
                <div class="player-name">${player.name}</div>
            </div>
            <div class="card-body">
                <div class="skill-tags" style="flex: 1; margin-right: 10px;">
                    <div style="margin-bottom: 8px;">
                        <span class="player-phase">${phaseName}</span>
                    </div>
                    ${tagsHtml || '<span style="color:#9CA3AF; font-size:0.85rem;">特徴が登録されていません</span>'}
                </div>
                ${miniMapHtml}
            </div>
            <div style="text-align: right; margin-top: 10px;">
                <button onclick="deletePlayer(${player.id})" style="background: none; border: none; color: #EF4444; cursor: pointer; font-size: 0.9rem; font-weight: bold;">削除</button>
            </div>
        `;
        list.appendChild(card);
    });

    // ★ドラッグ＆ドロップ（SortableJS）の設定
    if (sortableInstance) sortableInstance.destroy(); // 画面更新前に古い設定をリセット
    
    sortableInstance = new Sortable(list, {
        animation: 200, // 入れ替わる時のアニメーション速度（ミリ秒）
        ghostClass: 'sortable-ghost', // ドラッグ中のCSSクラス
        filter: "button", // ★プロの小技：「削除ボタン」を触った時はドラッグさせない
        preventOnFilter: false, 
        
        // ドロップして並び替えが完了した瞬間に発動する処理
        onEnd: function () {
            // 1. 画面上の新しい並び順（IDの配列）を取得
            const newOrderIds = Array.from(list.children).map(card => parseInt(card.dataset.id));
            
            // 2. 「他のチームの選手」と「今表示しているチームの選手」を分ける
            const otherPlayers = players.filter(p => p.team !== currentTeam);
            
            // 3. 今のチームの選手だけ、新しい順番に並べ替える
            const currentTeamPlayers = newOrderIds.map(id => players.find(p => p.id === id));
            
            // 4. ガッチャンコして保存（他のチームの選手データは壊さずに、今のチームだけ並び替え完了！）
            players = [...otherPlayers, ...currentTeamPlayers];
            localStorage.setItem('sakatsuku_players', JSON.stringify(players));
        }
    });
}