var reserves = [], foundations = [], tableaus = [];
var reserve_signs = 'abcd', tableau_signs = '12345678';
var current_move = -1, move_code = [], snapshots = [];
var elapse = 0, show_elapse = false;

function initialize() {
  Array.prototype.last = function() { return this[this.length - 1]; }
  create_clean_deck();
  create_standard_deck();
  document.getElementById('select_deck').value = selected_deck;
  hide_element('options');
  deal_hand(Math.floor(Math.random() * 1000 * 1000 * 1000) + 1);

  document.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/plain', event.target.id);
  });
  document.addEventListener('drop', (event) => {
    event.preventDefault();
    drag_and_drop(event.dataTransfer.getData('text/plain'),
                  get_parent_card_id(event.target));
  });
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
  reserves = new Array;
  foundations = new Array(4);
  for (var i = 0; i < foundations.length; ++i) {
    foundations[i] = new Array;
  }
  tableaus = new Array(8);
  for (var i = 0; i < tableaus.length; ++i) {
    tableaus[i] = new Array;
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
  move_code = [];
  snapshots = [];
  auto_play();

  elapse = 0;
  setTimeout(() => update_elapse(), 1000);
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
  ++current_move;
  set_element('moves', current_move);
  restore(snapshots[current_move]);
}

function redo_all() {
  if (current_move == snapshots.length - 1) {
    return;
  }
  current_move = snapshots.length - 1;
  set_element('moves', current_move);
  restore(snapshots[current_move]);
}

function set_card(card_id, left, top, z_index = 0) {
  var card_element = document.getElementById(card_id);
  var old_left = parseInt(card_element.style.left);
  var old_top = parseInt(card_element.style.top);
  var num_steps = 10;
  if (Math.abs(left - old_left) < 10 && Math.abs(top - old_top) < 10) {
    num_steps = 1;
  }
  var step_left = (left - old_left) / num_steps;
  var step_top = (top - old_top) / num_steps;
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
    card_element.style.zIndex &= 0xFF;
    card_element.onclick = () => try_move_card(get_card(card_element.id));
    card_element.ondragover = (event) => accept_drop(event);
    card_element.setAttribute('draggable', true);
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

function drag_and_drop(origin_id, target_id) {
  console.log(origin_id, target_id);
  var origin_field = get_field_type(origin_id);
  var target_field = get_field_type(target_id);
  if (origin_field[0] == 'r') {
    return drag_reserve_card(parseInt(origin_field[1]), target_field);
  }
  if (origin_field[0] == 't') {
    return drag_tableau_card(parseInt(origin_field[1]), target_field);
  }
}

function drag_reserve_card(index, target_field) {
  if (target_field[0] == 'f') {
    return try_reserve_to_foundation(index);
  }
  if (target_field[0] == 'r') {
    return false;
  }
  return try_reserve_to_tableau(index, parseInt(target_field[1]));
}

function drag_tableau_card(column, target_field) {
  if (target_field[0] == 'f') {
    return try_tableau_to_foundation(column);
  }
  if (target_field[0] == 'r') {
    return try_tableau_to_reserve(column);
  }
  return try_tableau_to_tableau(column, parseInt(target_field[1]));
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
  if (try_reserve_to_foundation(index)) { return true; }
  // Reserve to tableau, trying non-empty tableaus first.
  var card = reserves[index];
  for (var column = 0; column < tableaus.length; ++column) {
    if (tableaus[column].length > 0 && try_reserve_to_tableau(index, column)) {
      return true;
    }
  }
  for (var column = 0; column < tableaus.length; ++column) {
    if (tableaus[column].length == 0 && try_reserve_to_tableau(index, column)) {
      return true;
    }
  }
  return false;
}

function try_reserve_to_foundation(index, auto = true) {
  var card = reserves[index];
  if (can_push_to_foundation(card)) {
    remove_from_reserve(index);
    push_to_foundation(card);
    move_code.push(reserve_signs[index] + 'h');
    if (auto) {
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
    move_code.push(reserve_signs[index] + tableau_signs[column]);
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
      targets.push([i, num_movables]);
    }
  }
  if (targets.length > 0) {
    // Prefer moving more cards or to a longer tableau.
    targets.sort((a, b) => {
      return b[1] != a[1] ? b[1] - a[1] : tableaus[b[0]].length - tableaus[a[0]].length;
    });
    move_tableau_to_tableau(column, targets[0][0], targets[0][1]);
    move_code.push(tableau_signs[column] + tableau_signs[targets[0][0]]);
    auto_play();
    return true;
  }

  // Tableau to reserve.
  return try_tableau_to_reserve(column);
}

function try_tableau_to_foundation(column, auto = true) {
  var card = tableaus[column].last();
  if (can_push_to_foundation(card)) {
    tableaus[column].pop();
    push_to_foundation(card);
    move_code.push(tableau_signs[column] + 'h');
    if (auto) {
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
    move_code.push(tableau_signs[column] + 'r');
    auto_play();
    return true;
  }
  return false;
}

function try_tableau_to_tableau(origin_column, target_column) {
  var num_movables = can_move_tableau_to_tableau(origin_column, target_column);
  if (num_movables > 0) {
    move_tableau_to_tableau(origin_column, target_column, num_movables);
    move_code.push(tableau_signs[origin_column] + tableau_signs[target_column]);
    auto_play();
    return true;
  }
  return false;
}

function auto_play() {
  var played = true;
  while (played) {
    played = false;
    for (var index = reserves.length - 1; index >= 0; --index) {
      if (try_reserve_to_foundation(index, false)) {
        played = true;
      }
    }
    for (var column = 0; column < tableaus.length; ++column) {
      if (tableaus[column].length > 0 && try_tableau_to_foundation(column, false)) {
        played = true;
      }
    }
  }

  ++current_move;
  set_element('moves', current_move);

  if (current_move < snapshots.length) {
    snapshots = snapshots.slice(0, current_move);
  }
  snapshots.push({reserves:[...reserves], foundations:copy_2d(foundations),
                 tableaus:copy_2d(tableaus), move_code:move_code});
  move_code = [];

  if (sum_foundation_cards() == 52) {
    show_element('message');
    setTimeout(() => hide_element('message'), 5000);
  }
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

function push_to_foundation(card) {
  foundations[suit(card)].push(card);
  var id = 'f' + (suit(card)).toString();
  var rect = get_element_position(id);
  set_card(get_card_id(card), rect.left, rect.top, suit(card) * 13 + rank(card));
}

function can_push_to_reserve() {
  return reserves.length < 4;
}

function push_to_reserve(card) {
  reserves.push(card);
  var id = 'r' + (reserves.length - 1).toString();
  var rect = get_element_position(id);
  set_card(get_card_id(card), rect.left, rect.top, reserves.length - 1);
}

function remove_from_reserve(index) {
  for (var i = index; i < reserves.length - 1; ++i) {
    reserves[i] = reserves[i + 1];
    var id = 'r' + i.toString();
    var rect = get_element_position(id);
    set_card(get_card_id(reserves[i]), rect.left, rect.top, i);
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
  set_card(get_card_id(card), rect.left, rect.top + row * rect.height / 4,
           row + target * 8);
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
  ++elapse;
  if (show_elapse) {
    set_element('elapse', make_readable(elapse));
  }
  if (sum_foundation_cards() < 52) {
    setTimeout(() => update_elapse(), 1000);
  }
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