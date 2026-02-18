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
    // 1. 各種初期化処理
    migrateOldData();
    initTabs();
    initPositions();
    initFilterPositions(); 
    initPitchGrid();
    initPalette();
    initPhases();
    renderPlayers();

    // 2.クラブ追加機能を復活
    const addTeamBtn = document.querySelector('.btn-tab-add');
    const newTeamInput = document.querySelector('.tab-input-group input');

    if (addTeamBtn && newTeamInput) {
        addTeamBtn.addEventListener('click', () => {
            const teamName = newTeamInput.value.trim();
            if (teamName !== '') {
                // まだ存在しないチーム名なら追加して保存
                if (!teams.includes(teamName)) {
                    teams.push(teamName);
                    localStorage.setItem('sakatsuku_teams', JSON.stringify(teams)); // ※キーは環境に合わせてください
                }
                currentTeam = teamName;   // 今作ったチームを選択状態にする
                newTeamInput.value = '';  // 入力欄を空に戻す
                initTabs();               // チームのタブ一覧を再描画
                renderPlayers();          // 選手リストを切り替え
            }
        });
    }

    // 3. フォーム開閉と保存ボタン
    document.getElementById('toggleFormBtn').addEventListener('click', toggleForm);
    document.getElementById('savePlayerBtn').addEventListener('click', addPlayer);

    // 4. 総合力の「＋」ボタン処理（500刻みで切り上げ）
    document.getElementById('btnRatingUp').addEventListener('click', () => {
        const input = document.getElementById('pRating');
        let val = parseInt(input.value) || 0;
        input.value = Math.ceil((val + 1) / 500) * 500;
    });

    // 5. 総合力の「ー」ボタン処理（500刻みで切り下げ）
    document.getElementById('btnRatingDown').addEventListener('click', () => {
        const input = document.getElementById('pRating');
        let val = parseInt(input.value) || 0;
        let newVal = Math.floor((val - 1) / 500) * 500;
        if (newVal < 0) newVal = 0;
        input.value = newVal;
    });

    // 6. 【選手登録用】のアビリティ発動条件ボタンのON/OFF
    document.querySelectorAll('.ability-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
        });
    });

    // 7. 【絞り込み用】のアビリティ発動条件ボタンのON/OFF ＆ 絞り込み実行
    document.querySelectorAll('.filter-ability-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('selected');
            renderPlayers(); // クリックした瞬間にリストを更新する
        });
    });
});

// 過去に保存した選手（チーム未所属）を「初期チーム」に割り当てる処理
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

// チームタブの生成とドラッグ＆ドロップ制御（更新版）
function initTabs() {
    const container = document.getElementById('teamTabsContainer');
    container.innerHTML = '';

    teams.forEach(team => {
        const tab = document.createElement('div');
        tab.className = `team-pill ${team === currentTeam ? 'active' : ''}`;
        tab.dataset.team = team;

        // チーム名の文字部分
        const nameSpan = document.createElement('span');
        nameSpan.textContent = team;
        nameSpan.style.flex = '1';
        tab.appendChild(nameSpan);

        // 文字（nameSpan）ではなく、枠全体（tab）にクリック判定をつける
        tab.addEventListener('click', () => {
            currentTeam = team;
            initTabs(); 
            renderPlayers(); 
            const form = document.getElementById('addPlayerForm');
            if (form.style.display === 'block') toggleForm();
        });

        // ダブルクリックでクラブ名を変更
        tab.addEventListener('dblclick', (e) => {
            e.stopPropagation(); // 誤作動を防ぐ
            
            // 入力ポップアップを表示（初期値として現在の名前を入れておく）
            const newTeamName = prompt('新しいクラブ名を入力してください:', team);
            
            if (newTeamName !== null) { // キャンセルを押さなかった場合
                const trimmedName = newTeamName.trim();
                
                if (trimmedName === team) {
                    return; // 名前が変わっていない場合は何もしない
                }
                
                if (trimmedName === '') {
                    alert('クラブ名を空にはできません。');
                    return;
                }
                
                if (teams.includes(trimmedName)) {
                    alert('そのクラブ名は既に存在します！');
                    return;
                }
                
                // 1. クラブ一覧（teams）の該当する名前を書き換える
                const teamIndex = teams.indexOf(team);
                teams[teamIndex] = trimmedName;
                
                // 2. もし今開いているクラブの名前を変えたなら、現在選択中の状態も書き換える
                if (currentTeam === team) {
                    currentTeam = trimmedName;
                }
                
                // 3. このクラブに所属している「全選手」のデータも新しいクラブ名に書き換える
                players.forEach(p => {
                    if (p.team === team) {
                        p.team = trimmedName;
                    }
                });
                
                // 4. 全てのデータを保存して、画面を最新状態に更新する
                localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
                localStorage.setItem('sakatsuku_players', JSON.stringify(players));
                initTabs();
                renderPlayers();
            }
        });

        // 削除ボタン (×) ※チームが1つしかない場合は消せない
        if (teams.length > 1) {
            const delBtn = document.createElement('span');
            delBtn.className = 'delete-tab-btn';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation(); 
                
                // 1回目の確認ポップアップ
                if (confirm(`クラブ「${team}」を削除しますか？\n（所属している選手のデータもすべて削除されます）`)) {
                    // 1回目でOKを押した場合のみ、2回目の確認ポップアップを出す
                    if (confirm(`本当にクラブ「${team}」を削除してもよろしいですか？\n（所属している選手のデータもすべて削除されます）`)) {
                        teams = teams.filter(t => t !== team);
                        players = players.filter(p => p.team !== team);
                        localStorage.setItem('sakatsuku_teams', JSON.stringify(teams));
                        localStorage.setItem('sakatsuku_players', JSON.stringify(players));
                        
                        if (currentTeam === team) currentTeam = teams[0];
                        initTabs();
                        renderPlayers();
                    }
                }
            });
            tab.appendChild(delBtn);
        }

        container.appendChild(tab);
    });

    // タブのSortableJS設定
    if (teamSortableInstance) teamSortableInstance.destroy();
    
    teamSortableInstance = new Sortable(container, {
        animation: 200,
        ghostClass: 'team-pill-ghost',
        filter: '.delete-tab-btn',
        
        // タップとドラッグを明確に区別するための設定
        delay: 300,             // 長押しと判定するまでの時間（300ミリ秒 = 0.3秒）
        delayOnTouchOnly: true, // スマホ等のタッチ操作の時だけ長押しを要求する（PCマウスはすぐ掴めるようにする）
        touchStartThreshold: 5, // 長押し中に指が少し（5px）ブレてもキャンセルせずタップとして許容する「遊び」
        
        onEnd: function () {
            const newTeams = Array.from(container.children).map(tab => tab.dataset.team);
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

// 絞り込み用のポジションセレクトボックスを初期化する
function initFilterPositions() {
    const filterList = document.getElementById('filterPosOptionsList');
    filterList.innerHTML = ''; 

    // 1. 「すべて表示」の選択肢を追加
    const allOption = document.createElement('div');
    allOption.className = 'custom-option';
    allOption.textContent = 'すべて表示';
    allOption.style.backgroundColor = '#374151'; // 少し暗いグレー
    allOption.addEventListener('click', () => {
        document.getElementById('filterPosSelect').value = '';
        document.getElementById('filterPosSelectLabel').textContent = 'すべて表示';
        // 初期状態の見た目に戻す
        const trigger = document.getElementById('filterPosSelectTrigger');
        trigger.style.backgroundColor = 'rgba(31, 41, 55, 0.9)'; 
        trigger.style.color = 'white';
        document.getElementById('filterPosSelectWrapper').classList.remove('open');
        renderPlayers(); // ★選択した瞬間に絞り込み実行
    });
    filterList.appendChild(allOption);

    // 2. 各ポジションの選択肢を追加
    GAME_DATA.positions.forEach(pos => {
        const option = document.createElement('div');
        option.className = 'custom-option';
        // 選手登録フォームと同じ表示形式にする
        option.textContent = pos.name ? `${pos.id}（${pos.name}）` : pos.id; 
        option.style.backgroundColor = pos.color;
        
        option.addEventListener('click', () => {
            document.getElementById('filterPosSelect').value = pos.id;
            document.getElementById('filterPosSelectLabel').textContent = pos.name ? `${pos.id}（${pos.name}）` : pos.id;
            // 選択したポジションの色に変更する
            const trigger = document.getElementById('filterPosSelectTrigger');
            trigger.style.backgroundColor = pos.color;
            trigger.style.color = 'white';
            document.getElementById('filterPosSelectWrapper').classList.remove('open');
            renderPlayers(); // ★選択した瞬間に絞り込み実行
        });
        filterList.appendChild(option);
    });

    // 3. クリックでドロップダウンを開閉する処理
    document.getElementById('filterPosSelectTrigger').addEventListener('click', () => {
        document.getElementById('filterPosSelectWrapper').classList.toggle('open');
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

        // パレットの選択状態を「最適（赤）」にリセットする
        document.querySelectorAll('.palette-btn').forEach(b => b.classList.remove('selected'));
        document.querySelector('.palette-btn[data-color="red"]').classList.add('selected');
        currentPaintColor = 'red';

        // 開いた瞬間に、選択中のポジションをマップに反映させる処理
        // 1. まずマップを完全にリセットして真っさらにする
        document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(c => {
            c.removeAttribute('data-apt');
        });

        // 2. 現在ドロップダウンで選択されているポジションの値（CFなど）を取得
        // （カスタムドロップダウンの裏にある隠しinput要素から値を取ります）
        const currentPosId = document.getElementById('pPos').value;

        // 3. そのポジションに対応するマップ上のマスを探して「赤（最適）」に塗る
        if (currentPosId) {
            const cell = document.querySelector(`.pitch-cell[data-pos="${currentPosId}"]`);
            if (cell) {
                cell.setAttribute('data-apt', 'red');
            }
        }

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
    const rating = document.getElementById('pRating').value;
    const pos = document.getElementById('pPos').value;

    if (!name) {
        alert('選手名を入力してください');
        return;
    }

    const aptitudes = {};
    document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(cell => {
        if (cell.dataset.pos && cell.dataset.apt) {
            aptitudes[cell.dataset.pos] = cell.dataset.apt;
        }
    });

    // 選択されているアビリティを取得して配列にする
    const abilities = [];
    document.querySelectorAll('.ability-btn.selected').forEach(btn => {
        abilities.push(btn.dataset.cond);
    });

    const newPlayer = {
        id: Date.now(),
        name: name,
        rating: rating ? parseInt(rating, 10) : 0,
        position: pos,
        aptitudes: aptitudes,
        phase: currentPhase,
        abilities: abilities,
        team: currentTeam 
    };

    players.push(newPlayer);
    localStorage.setItem('sakatsuku_players', JSON.stringify(players));
    
    // フォームリセット
    document.getElementById('pName').value = '';
    document.getElementById('pRating').value = '4500';
    document.querySelectorAll('#formPitchGrid .pitch-cell').forEach(c => c.removeAttribute('data-apt'));
    
    document.querySelectorAll('.phase-btn').forEach(b => b.classList.remove('selected'));
    document.querySelector('.phase-btn[data-phase="安定期"]').classList.add('selected');
    currentPhase = '安定期';

    // アビリティの選択状態をすべてリセット
    document.querySelectorAll('.ability-btn').forEach(b => b.classList.remove('selected'));

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

// 選手リストの描画（絞り込み＆ソート機能付き）
function renderPlayers() {
    const list = document.getElementById('playerList');
    list.innerHTML = '';

    const teamPlayers = players.filter(player => player.team === currentTeam);

    if (teamPlayers.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: #9CA3AF;">${currentTeam} にはまだ選手が登録されていません。</div>`;
        return;
    }

    // 1. 絞り込み条件の取得
    const filterPos = document.getElementById('filterPosSelect').value;
    const filterAbilities = Array.from(document.querySelectorAll('.filter-ability-btn.selected')).map(btn => btn.dataset.cond);

    // 2. 選手の絞り込み処理
    const targetPlayers = teamPlayers.filter(player => {
        // --- アビリティによる絞り込み（選択した条件をすべて満たす選手を残す） ---
        let matchAbility = true;
        if (filterAbilities.length > 0) {
            if (!player.abilities) {
                matchAbility = false;
            } else {
                matchAbility = filterAbilities.every(cond => player.abilities.includes(cond));
            }
        }

        // --- ポジション適性による絞り込み（サブポジのマップ色も判定する） ---
        let matchPos = true;
        if (filterPos !== "") {
            const isMainPos = player.position === filterPos;
            // 赤=最適, orange=適正, yellow=弱め
            const hasAptitude = player.aptitudes && (player.aptitudes[filterPos] === 'red' || player.aptitudes[filterPos] === 'orange' || player.aptitudes[filterPos] === 'yellow');
            
            if (!isMainPos && !hasAptitude) {
                matchPos = false; // 本職でもなく、マップに適性も塗られていない場合は除外
            }
        }

        return matchAbility && matchPos;
    });

    if (targetPlayers.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 40px; color: #9CA3AF;">条件に一致する選手が見つかりません。</div>`;
        return;
    }

    // 3. 表示順の並び替え（ソート）処理
    targetPlayers.sort((a, b) => {
        // --- ★特別ルール：ポジションで絞り込んでいる場合は「適性レベルが高い順」を最優先する ---
        if (filterPos !== "") {
            const getAptScore = (p) => {
                if (p.position === filterPos) return 4; // 本職が最強
                if (!p.aptitudes) return 0;
                if (p.aptitudes[filterPos] === 'red') return 3;    // 最適（赤）
                if (p.aptitudes[filterPos] === 'orange') return 2; // 適正（オレンジ）
                if (p.aptitudes[filterPos] === 'yellow') return 1; // 弱め（黄色）
                return 0; // 適性なし
            };
            
            const scoreA = getAptScore(a);
            const scoreB = getAptScore(b);
            
            if (scoreA !== scoreB) {
                return scoreB - scoreA; // スコアが高い選手を上に持ってくる
            }
        }

        // --- 以降は通常の並び替え（ポジション順 → 総合力順） ---
        const posIndexA = GAME_DATA.positions.findIndex(p => p.id === a.position);
        const posIndexB = GAME_DATA.positions.findIndex(p => p.id === b.position);
        const sortPosA = posIndexA !== -1 ? posIndexA : 99;
        const sortPosB = posIndexB !== -1 ? posIndexB : 99;

        if (sortPosA !== sortPosB) {
            return sortPosA - sortPosB;
        }

        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        return ratingB - ratingA;
    });

    // 4. HTMLの生成（ここから下は変更ありません）
    targetPlayers.forEach(player => {
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

        const ratingHtml = player.rating > 0 ? `<div class="player-rating">${player.rating}</div>` : '';

        const abilitiesHtml = (player.abilities && player.abilities.length > 0)
            ? `<div class="ability-tags">${player.abilities.map(a => `<span class="ability-tag">${a}</span>`).join('')}</div>`
            : '';

        const card = document.createElement('div');
        card.className = 'player-card';

        card.innerHTML = `
            <div class="card-header">
                <div class="card-header-left">
                    <div class="player-pos" style="background-color: ${posColor};">${posName}</div>
                    <div class="player-name">${player.name}</div>
                </div>
                ${ratingHtml}
            </div>
            <div class="card-body">
                <div style="flex: 1; margin-right: 10px;">
                    <div style="margin-bottom: 8px;">
                        <span class="player-phase" data-phase="${phaseName}">${phaseName}</span>
                    </div>
                    ${abilitiesHtml}
                </div>
                ${miniMapHtml}
            </div>
            <div style="text-align: right; margin-top: 10px;">
                <button onclick="deletePlayer(${player.id})" style="background: none; border: none; color: #EF4444; cursor: pointer; font-size: 0.9rem; font-weight: bold;">削除</button>
            </div>
        `;
        list.appendChild(card);
    });
}