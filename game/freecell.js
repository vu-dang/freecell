var reserves = [], foundations = [], tableaus = [];
var reserve_signs = 'abcd', tableau_signs = '12345678';
var current_move = -1, move_codes = [], snapshots = [];
var card_destinations = [];
var selected_auto_play = 'max';
var elapse = 0, show_elapse = false;
var solutions = {};

function initialize() {
  Array.prototype.last = function() { return this[this.length - 1]; }

  create_clean_deck();
  create_picture_decks();
  hide_element('options');

  var new_auto_play = get_cookie('auto_play');
  if (['max', 'safe', 'none'].includes(new_auto_play)) {
    selected_auto_play = new_auto_play;
  }
  document.getElementById('select_auto_play').value = selected_auto_play;

  var new_deck = parseInt(get_cookie('deck'));
  if (0 <= new_deck && new_deck < deck_pictures.length) {
    selected_deck = new_deck;
  }
  document.getElementById('select_deck').value = selected_deck;

  const url_params = new URLSearchParams(window.location.search);
  if (url_params.get('deal') != null) {
    var deal = url_params.get('deal').split(':');
    if (deal.length <= 1) {
      deal_hand(parseInt(deal[0]));
    } else {
      play_solution(parseInt(deal[0]), deal[1]);
    }
  } else {
    deal_hand(Math.floor(Math.random() * 1000 * 1000 * 1000) + 1);
  }

  document.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', event.target.id);
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    drag_and_drop(event.dataTransfer.getData('text/plain'),
                  get_parent_card_id(event.target));
  });
  setTimeout(() => update_elapse(), 1000);
}

function set_deal() {
  deal_hand(document.getElementById('deal_num').value);
}

function previous_deal() {
  deal_hand(parseInt(document.getElementById('deal_num').value) - 1);
}

function next_deal() {
  deal_hand(parseInt(document.getElementById('deal_num').value) + 1);
}

function deal_hand(deal_num) {
  document.getElementById('deal_num').value = deal_num;

  // Initialize the table.
  reserves = [];
  foundations = new Array(4);
  for (var i = 0; i < foundations.length; ++i) {
    foundations[i] = [];
  }
  tableaus = new Array(8);
  for (var i = 0; i < tableaus.length; ++i) {
    tableaus[i] = [];
  }
  card_destinations = new Array(52);
  for (var i = 0; i < card_destinations.length; ++i) {
    card_destinations[i] = [];
  }

  // Shuffle the deck.
  var deck = [...Array(52).keys()];
  var seed = deal_num;
  for (var i = 0; i < deck.length; ++i) {
    var cards_left = deck.length - i;
    seed = (seed * 214013 + 2531011) & 0xffffffff;
    var rand = (seed >> 16) & 0x7fff;
    var rect = deal_num < 0x80000000 ? rand % cards_left : (rand | 0x8000) % cards_left;
    [deck[rect], deck[cards_left - 1]] = [deck[cards_left - 1], deck[rect]];
  }
  deck.reverse();

  // Put cards on tableaus.
  var rect = get_element_position('logo');
  for (var i = 0; i < deck.length; ++i) {
    push_to_tableau(deck[i], i % 8);
  }

  current_move = -1;
  move_codes = [];
  snapshots = [];
  auto_play();

  elapse = 0;
}

function redraw() {
  restore(snapshots[current_move]);
}

function restore(snapshot) {
  reserves = [];
  for (var card of snapshot.reserves) {
    push_to_reserve(card);
  }
  for (var i = 0; i < foundations.length; ++i) {
    foundations[i] = [];
    for (var card of snapshot.foundations[i]) {
      push_to_foundation(card);
    }
  }
  for (var i = 0; i < tableaus.length; ++i) {
    tableaus[i] = [];
    for (var card of snapshot.tableaus[i]) {
      push_to_tableau(card, i);
    }
  }
}

function undo() {
  if (current_move == 0) {
    return;
  }
  --current_move;
  set_element('moves', current_move);
  restore(snapshots[current_move]);
}

function undo_all() {
  if (current_move == 0) {
    return;
  }
  current_move = 0;
  set_element('moves', current_move);
  restore(snapshots[current_move]);
}

function redo() {
  if (current_move == snapshots.length - 1) {
    return;
  }
  play_coded_move(snapshots[current_move + 1].move_codes[0]);
}

function redo_all() {
  if (current_move == snapshots.length - 1) {
    return;
  }
  current_move = snapshots.length - 1;
  set_element('moves', current_move);
  restore(snapshots[current_move]);
}

function get_solution() {
  var deal_num = document.getElementById('deal_num').value;
  if (deal_num <= 0 || deal_num > 221000) {
    return;
  }
  if (solutions[deal_num]) {
    play_solution(deal_num, solutions[deal_num]);
    return;
  }
  var url = 'https://raw.githubusercontent.com/macroxue/freecell/master/solutions/block.'
    + Math.ceil(deal_num / 1000).toString();
  fetch(url).then(r => r.text()).then(text => {
    for (var line of text.split('\n')) {
      var deal = line.split(':');
      solutions[deal[0]] = deal[1];
    }
    play_solution(deal_num, solutions[deal_num]);
  });
}

function play_solution(deal_num, solution) {
  var foundation_moves = (solution.match(/h/g) || []).length;
  selected_auto_play = foundation_moves == 0 ? 'max' :
    foundation_moves < 52 ? 'safe' : 'none';
  document.getElementById('select_auto_play').value = selected_auto_play;
  show_element('options');
  deal_hand(deal_num);
  for (var i = 0; i < solution.length; i += 2) {
    play_coded_move(solution.slice(i, i+2));
  }
}

function play_coded_move(move_code) {
  var from = move_code[0], to = move_code[1];
  var index = reserve_signs.indexOf(from);
  if (index >= 0) {
    if (to == 'h') {
      return try_reserve_to_foundation(index);
    }
    var column = tableau_signs.indexOf(to);
    if (column >= 0) {
      return try_reserve_to_tableau(index, column);
    }
    return;
  }
  var column = tableau_signs.indexOf(from);
  if (column >= 0) {
    if (to == 'h') {
      return try_tableau_to_foundation(column);
    }
    if (to == 'r') {
      return try_tableau_to_reserve(column);
    }
    var new_column = tableau_signs.indexOf(to);
    if (new_column >= 0) {
      return try_tableau_to_tableau(column, new_column);
    }
    return;
  }
}

function set_card(card, left, top, z_index = 0) {
  card_destinations[card].push({left:left, top:top, z_index:z_index});
  if (card_destinations[card].length == 1) {
    start_animation(get_card_id(card), left, top, z_index);
  }
}

function start_animation(card_id, left, top, z_index) {
  var card_element = document.getElementById(card_id);
  var old_left = parseInt(card_element.style.left);
  var old_top = parseInt(card_element.style.top);
  var num_steps = 15, step_left = 0, step_top = 0;
  while (num_steps > 1 && Math.abs(step_left) < 20 && Math.abs(step_top) < 20) {
    --num_steps;
    step_left = (left - old_left) / num_steps;
    step_top = (top - old_top) / num_steps;
  }
  card_element.style.display = 'block';
  card_element.style.zIndex = z_index | 0x100;
  card_element.onclick = () => {};
  card_element.ondragover = () => {};
  card_element.setAttribute('draggable', false);
  animate_move(card_element, old_left, old_top, num_steps, step_left, step_top);
}

function animate_move(card_element, left, top, num_steps, step_left, step_top) {
  left += step_left;
  top += step_top;
  card_element.style.left = left;
  card_element.style.top = top;
  if (--num_steps > 0) {
    setTimeout(() => animate_move(card_element, left, top,
                                  num_steps, step_left, step_top), 10);
  } else {
    var card = get_card(card_element.id);
    card_element.style.zIndex &= 0xFF;
    card_element.onclick = () => move_card(card);
    card_element.ondragover = (event) => accept_drop(event);
    card_element.setAttribute('draggable', true);
    card_destinations[card].shift();
    if (card_destinations[card].length >= 1) {
      var d = card_destinations[card][0];
      start_animation(get_card_id(card), d.left, d.top, d.z_index);
    }
  }
}

function accept_drop(event) {
  event.preventDefault();
}

function get_parent_card_id(child) {
  while (child.className != 'card' && child.className != 'nocard') {
    child = child.parentNode;
  }
  return child.id;
}

function get_field_type(id) {
  if (id[0] == 'r' || id[0] == 'f' || id[0] == 't') {
    return id;
  }
  var card = get_card(id);
  var index = reserves.findIndex((e) => e == card);
  if (index >= 0) {
    return 'r' + index.toString();
  }
  for (var i = 0; i < foundations.length; ++i) {
    var index = foundations[i].findIndex((e) => e == card);
    if (index >= 0) {
      return 'f' + i.toString();
    }
  }
  for (var i = 0; i < tableaus.length; ++i) {
    var row = tableaus[i].findIndex((e) => e == card);
    if (row >= 0) {
      return 't' + i.toString();
    }
  }
}

function check_for_completion() {
  if (sum_foundation_cards() == 52) {
    show_element('done');
    setTimeout(() => hide_element('done'), 5000);
  }
}

function drag_and_drop(origin_id, target_id) {
  if (try_drag_and_drop(origin_id, target_id)) {
    check_for_completion();
  }
}

function try_drag_and_drop(origin_id, target_id) {
  var origin_field = get_field_type(origin_id);
  var target_field = get_field_type(target_id);
  if (origin_field[0] == 'r') {
    return try_drag_reserve_card(parseInt(origin_field[1]), target_field);
  }
  if (origin_field[0] == 't') {
    return try_drag_tableau_card(parseInt(origin_field[1]), target_field);
  }
}

function try_drag_reserve_card(index, target_field) {
  if (target_field[0] == 'f') {
    return try_reserve_to_foundation(index);
  }
  if (target_field[0] == 'r') {
    return false;
  }
  return try_reserve_to_tableau(index, parseInt(target_field[1]));
}

function try_drag_tableau_card(column, target_field) {
  if (target_field[0] == 'f') {
    return try_tableau_to_foundation(column);
  }
  if (target_field[0] == 'r') {
    return try_tableau_to_reserve(column);
  }
  return try_tableau_to_tableau(column, parseInt(target_field[1]));
}

function move_card(card) {
  if (try_move_card(card)) {
    check_for_completion();
  }
}

function try_move_card(card) {
  var index = reserves.findIndex((e) => e == card);
  if (index >= 0) {
    return try_move_reserve_card(index);
  }
  for (var i = 0; i < tableaus.length; ++i) {
    var row = tableaus[i].findIndex((e) => e == card);
    if (row >= 0) {
      return try_move_tableau_card(i, row);
    }
  }
  return false;
}

function try_move_reserve_card(index) {
  // Reserve to foundation.
  if (try_reserve_to_foundation(index)) {
    return true;
  }
  // Reserve to tableau.
  var targets = [];
  for (var i = 0; i < tableaus.length; ++i) {
    if (can_push_to_tableau(reserves[index], i)) {
      targets.push({column:i, min_unsorted:min_unsorted_rank(tableaus[i])});
    }
  }
  if (targets.length > 0) {
    // Prefer a tableau with higher unsorted ranks.
    targets.sort((a, b) => { return b.min_unsorted - a.min_unsorted; });
    return try_reserve_to_tableau(index, targets[0].column);
  }
  return false;
}

function try_reserve_to_foundation(index, is_auto_play = false) {
  var card = reserves[index];
  if (can_push_to_foundation(card)) {
    remove_from_reserve(index);
    push_to_foundation(card, is_auto_play);
    move_codes.push(reserve_signs[index] + 'h');
    if (!is_auto_play) {
      auto_play();
    }
    return true;
  }
  return false;
}

function try_reserve_to_tableau(index, column) {
  var card = reserves[index];
  if (can_push_to_tableau(card, column)) {
    remove_from_reserve(index);
    push_to_tableau(card, column);
    move_codes.push(reserve_signs[index] + tableau_signs[column]);
    auto_play();
    return true;
  }
  return false;
}

function try_move_tableau_card(column, row) {
  // Tableau to foundation.
  if (try_tableau_to_foundation(column)) { return true; }

  // Tableau to tableau.
  var targets = [];
  for (var i = 0; i < tableaus.length; ++i) {
    var num_movables = can_move_tableau_to_tableau(column, i);
    if (num_movables > 0) {
      targets.push({column:i, count:num_movables,
                   min_unsorted:min_unsorted_rank(tableaus[i])});
    }
  }
  if (targets.length > 0) {
    // Prefer moving more cards or to a tableau with higher unsorted ranks.
    targets.sort((a, b) => {
      if (b.count != a.count) {
        return b.count - a.count;
      }
      return b.min_unsorted - a.min_unsorted;
    });
    return try_tableau_to_tableau(column, targets[0].column);
  }

  // Tableau to reserve.
  return try_tableau_to_reserve(column);
}

function try_tableau_to_foundation(column, is_auto_play = false) {
  var card = tableaus[column].last();
  if (can_push_to_foundation(card)) {
    tableaus[column].pop();
    push_to_foundation(card, is_auto_play);
    move_codes.push(tableau_signs[column] + 'h');
    if (!is_auto_play) {
      auto_play();
    }
    return true;
  }
  return false;
}

function try_tableau_to_reserve(column) {
  var card = tableaus[column].last();
  if (can_push_to_reserve()) {
    tableaus[column].pop();
    push_to_reserve(card);
    move_codes.push(tableau_signs[column] + 'r');
    auto_play();
    return true;
  }
  return false;
}

function try_tableau_to_tableau(origin_column, target_column) {
  var num_movables = can_move_tableau_to_tableau(origin_column, target_column);
  if (num_movables > 0) {
    move_tableau_to_tableau(origin_column, target_column, num_movables);
    move_codes.push(tableau_signs[origin_column] + tableau_signs[target_column]);
    auto_play();
    return true;
  }
  return false;
}

function select_auto_play() {
  selected_auto_play = document.getElementById('select_auto_play').value;
  set_cookie('auto_play', selected_auto_play);
}

function is_safe_auto_play(card) {
  if (selected_auto_play == 'none' || !can_push_to_foundation(card)) {
    return false;
  }
  if (selected_auto_play == 'max' || rank(card) <= deuce) {
    return true;
  }
  if (color(card) == red) {
    return foundations[spades].length >= rank(card)
      && foundations[clubs].length >= rank(card);
  } else {
    return foundations[hearts].length >= rank(card)
      && foundations[diams].length >= rank(card);
  }
}

function auto_play() {
  var played = true;
  while (played) {
    played = false;
    for (var index = reserves.length - 1; index >= 0; --index) {
      if (is_safe_auto_play(reserves[index]) && try_reserve_to_foundation(index, true)) {
        played = true;
      }
    }
    for (var column = 0; column < tableaus.length; ++column) {
      if (tableaus[column].length > 0 && is_safe_auto_play(tableaus[column].last()) &&
          try_tableau_to_foundation(column, true)) {
        played = true;
      }
    }
  }

  ++current_move;
  set_element('moves', current_move);
  // Truncate the snapshots after a new move.
  if (current_move < snapshots.length &&
      move_codes[0] != snapshots[current_move].move_codes[0]) {
    snapshots = snapshots.slice(0, current_move);
  }
  if (current_move == snapshots.length) {
    snapshots.push({reserves:[...reserves], foundations:copy_2d(foundations),
                   tableaus:copy_2d(tableaus), move_codes:move_codes});
  }
  move_codes = [];
}

function sum_foundation_cards() {
  var sum = 0;
  for (var i = 0; i < foundations.length; ++i) {
    sum += foundations[i].length;
  }
  return sum;
}

function copy_2d(array) {
  var copy = [];
  for (var i = 0; i < array.length; ++i) {
    copy.push([...array[i]]);
  }
  return copy;
}

function can_push_to_foundation(card) {
  return foundations[suit(card)].length == rank(card);
}

function push_to_foundation(card, is_auto_play = false) {
  foundations[suit(card)].push(card);
  var id = 'f' + (suit(card)).toString();
  var rect = get_element_position(id);
  var z_index = suit(card) * 13 + rank(card);
  if (is_auto_play) {
    setTimeout(() => set_card(card, rect.left, rect.top, z_index), 300);
  } else {
    set_card(card, rect.left, rect.top, z_index);
  }
}

function can_push_to_reserve() {
  return reserves.length < 4;
}

function push_to_reserve(card) {
  reserves.push(card);
  var id = 'r' + (reserves.length - 1).toString();
  var rect = get_element_position(id);
  set_card(card, rect.left, rect.top, reserves.length - 1);
}

function remove_from_reserve(index) {
  for (var i = index; i < reserves.length - 1; ++i) {
    reserves[i] = reserves[i + 1];
    var id = 'r' + i.toString();
    var rect = get_element_position(id);
    set_card(reserves[i], rect.left, rect.top, i);
  }
  reserves.pop();
}

function can_push_to_tableau(card, target) {
  if (tableaus[target].length == 0) {
    return true;
  }
  var lead = tableaus[target].last();
  return rank(card) == rank(lead) - 1 && color(card) != color(lead);
}

function push_to_tableau(card, target) {
  tableaus[target].push(card);
  var row = tableaus[target].length - 1;
  var id = 't' + target.toString();
  var rect = get_element_position(id);
  set_card(card, rect.left, rect.top + row * rect.height / 4.25, row + target * 8);
}

function can_move_tableau_to_tableau(origin, target) {
  if (origin == target) {
    return 0;
  }
  var num_movable = count_movable(tableaus[origin], tableaus[target]);
  if (num_movable == 0) {
    return 0;
  }
  var super_moves = super_move_size(origin, target);
  if (tableaus[target].length > 0 && num_movable > super_moves) {
    return 0;
  }
  if (tableaus[target].length == 0) {
    num_movable = Math.min(num_movable, super_moves);
  }
  if (tableaus[origin].length == num_movable && tableaus[target].length == 0) {
    return 0;
  }
  return num_movable;
}

function move_tableau_to_tableau(origin, target, num_movable) {
  for (var i = tableaus[origin].length - num_movable; i < tableaus[origin].length; ++i) {
    push_to_tableau(tableaus[origin][i], target);
  }
  for (var i = 0; i < num_movable; ++i) {
    tableaus[origin].pop();
  }
}

function count_movable(origin_tableau, target_tableau) {
  if (origin_tableau.length == 0) {
    return 0;
  }
  if (target_tableau.length == 0) {
    return count_sorted(origin_tableau);
  }
  var lead = target_tableau.last();
  var top = origin_tableau.last();
  var rank_diff = rank(lead) - rank(top);
  if (rank_diff <= 0) {
    return 0;
  }
  if (count_sorted(origin_tableau) < rank_diff) {
    return 0;
  }
  if ((rank_diff & 1) == (color(top) == color(lead))) {
    return 0;
  }
  return rank_diff;
}

function count_sorted(tableau) {
  if (tableau.length == 0) {
    return 0;
  }
  var count = 1;
  for (var i = tableau.length - 2; i >= 0; --i) {
    if (rank(tableau[i+1]) != rank(tableau[i]) - 1 ||
        color(tableau[i+1]) == color(tableau[i])) {
      break;
    }
    ++count;
  }
  return count;
}

function min_unsorted_rank(tableau) {
  if (tableau.length == 0) {
    return -1;
  }
  var num_unsorted = tableau.length - count_sorted(tableau);
  if (num_unsorted == 0) {
    return rank(tableau[0]) + 1;
  }
  return Math.min(...tableau.slice(0, num_unsorted).map(x => rank(x)));
}

function super_move_size(origin, target) {
  var free_cells = 4 - reserves.length;
  var empty_tableaus = 0;
  for (var i = 0; i < tableaus.length; ++i) {
    if (i == origin || i == target) {
      continue;
    }
    if (tableaus[i].length == 0) {
      ++empty_tableaus;
    }
  }
  return (free_cells + 1) << empty_tableaus;
}

function get_element_position(element_id) {
  var rect = document.getElementById(element_id).getBoundingClientRect();
  scroll_left = Math.max(document.documentElement.scrollLeft, document.body.scrollLeft);
  scroll_top = Math.max(document.documentElement.scrollTop, document.body.scrollTop);
  return {left: rect.left + scroll_left, top: rect.top + scroll_top,
    width: rect.width, height: rect.height};
}

function set_element(id, value) {
  document.getElementById(id).innerHTML = value;
}

function show_element(id) {
  document.getElementById(id).style.display = 'block';
}

function hide_element(id) {
  document.getElementById(id).style.display = 'none';
}

function toggle_element(id) {
  var element = document.getElementById(id);
  if (element.style.display == 'none') {
    element.style.display = 'block';
  } else {
    element.style.display = 'none';
  }
  redraw();
}

function update_elapse() {
  if (sum_foundation_cards() < 52) {
    ++elapse;
  }
  if (show_elapse) {
    set_element('elapse', make_readable(elapse));
  }
  setTimeout(() => update_elapse(), 1000);
}

function toggle_elapse() {
  show_elapse = !show_elapse;
  if (show_elapse) {
    set_element('elapse', make_readable(elapse));
  } else {
    set_element('elapse', 'Time');
  }
}

function make_readable(elapse) {
  var minutes = Math.floor(elapse / 60), seconds = elapse % 60;
  return minutes.toString() + ':' + ('0' + seconds.toString()).slice(-2);
}

function set_cookie(key, value, expiration_days = 30) {
  var date = new Date();
  date.setTime(date.getTime() + (expiration_days * 86400 * 1000));
  document.cookie = key + '=' + value + ';expires=' + date.toUTCString() +
    ';path=/;SameSite=strict';
}

function get_cookie(key) {
  var cookies = decodeURIComponent(document.cookie).split(/; */);
  for(var cookie of cookies) {
    var pair = cookie.split('=');
    if (key == pair[0]) {
      return pair[1];
    }
  }
  return '';
}

function show_help() {
  hide_element('help_sign');
  show_element('help_message');
}

function hide_help() {
  hide_element('help_message');
  show_element('help_sign');
}
