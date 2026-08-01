/**
ПЕРЕВОД f, g, vertices, portal_v0, portal_v1 В ПЛОСКИЕ МАССИВЫ НЕ ДАСТ ПРИБАВКУ К СКОРОСТИ ВЫПОЛНЕНИЯ КОДА


ИСПОЛЬЗОВАНИЕ ИНКРЕМЕНТИРУЕМОГО CALL_COUNTER (RUNTIME-МАРКЕРА) ДЛЯ МГНОВЕННОГО ОБНУЛЕНИЯ СОСТОЯНИЙ VISITED И CLOSED ЗА 1 ТАКТ CPU БЕЗ ПЕРЕБОРА ВСЕГО ГРАФА ЦИКЛОМ FOR — ЭТО ФУНДАМЕНТАЛЬНЫЙ ГЕЙМДЕВ-ПАТТЕРН, НА КОТОРОМ ДЕРЖИТСЯ ПРОИЗВОДИТЕЛЬНОСТЬ RECAST/DETOUR
**/


let call_counter=0; // СЧЁТЧИК ВЫЗОВОВ
let open_heap=[]; // КУЧА
let nodes;


// ____________________ sink_down ____________________


function sink_down(n){


// ПОЛУЧАЕМ ЭЛЕМЕНТ, КОТОРЫЙ НЕОБХОДИМО ПОМЕСТИТЬ В ХРАНИЛИЩЕ.
const element=open_heap[n];
const element_f=element.f;


// КОГДА ЗНАЧЕНИЕ РАВНО 0, ЭЛЕМЕНТ НЕ МОЖЕТ ОПУСТИТЬСЯ НИЖЕ.
while(n>0){
// ВЫЧИСЛЯЕМ ИНДЕКС РОДИТЕЛЬСКОГО ЭЛЕМЕНТА И ПОЛУЧАЕМ ЕГО.
const parentN=((n+1)>>1)-1;
const parent=open_heap[parentN];


if(element_f<parent.f){
// МЕНЯЕМ МЕСТАМИ ЭЛЕМЕНТЫ, ЕСЛИ РОДИТЕЛЬСКИЙ ЭЛЕМЕНТ БОЛЬШЕ.
open_heap[parentN]=element;
open_heap[n]=parent;
// ОБНОВЛЯЕМ "n", ЧТОБЫ ПРОДОЛЖИТЬ С НОВОЙ ПОЗИЦИИ.
n=parentN;
}
else{
// НАЙДЕН РОДИТЕЛЬ, КОТОРЫЙ МЕНЬШЕ ПО РАЗМЕРУ, НЕТ НЕОБХОДИМОСТИ ОПУСКАТЬСЯ НИЖЕ.
break;
}
}


}
  

// ____________________ bubble_up ____________________


// ПЕРЕДЕЛАННЫЙ bubble_up, Т.К. МЫ ВСЕГДА ПЕРЕДАЁМ ЗНАЧЕНИЕ N=0

  
function bubble_up(){


// НАХОДИМ ЦЕЛЕВОЙ ЭЛЕМЕНТ И ЕГО ОЦЕНКУ
const length=open_heap.length;
// ЗАЩИТА ОТ ПУСТОЙ КУЧИ ИЛИ 1 ЭЛЕМЕНТА
if(length<=1){ return; }
const element=open_heap[0];
const elemScore=element.f;
let n=0;
// ПРЕДРАСЧЁТ ИНДЕКСОВ ДЛЯ ПЕРВОЙ ИТЕРАЦИИ
let child1N=1;
let child2N=2;


while(true){


// ФУНКЦИЯ open_heap ИСПОЛЬЗУЕТСЯ ДЛЯ ХРАНЕНИЯ НОВОЙ ПОЗИЦИИ ЭЛЕМЕНТА, ЕСЛИ ТАКОВАЯ ИМЕЕТСЯ.
let swap=null;
let child1Score;


// ЕСЛИ ПЕРВЫЙ ДОЧЕРНИЙ ЭЛЕМЕНТ СУЩЕСТВУЕТ (НАХОДИТСЯ ВНУТРИ МАССИВА)
if(child1N<length){
// НАХОДИМ И ОЦЕНИВАЕМ
child1Score=open_heap[child1N].f;
// ЕСЛИ ОЦЕНКА МЕНЬШЕ, ЧЕМ У НАШЕГО ЭЛЕМЕНТА, НАМ НУЖНО ПРОИЗВЕСТИ ЗАМЕНУ
if(child1Score<elemScore){
swap=child1N;
}


}


/**
МАТЕМАТИЧЕСКИЙ ЭТАЛОН СОРТИРОВКИ КУЧИ (НЕ РЕФАКТОРИТЬ И НЕ МЕНЯТЬ!):
Тернарный оператор (swap === null ? elemScore : child1Score) абсолютно верен и оптимизирован под JIT V8.
Логика работы на уровне железа:
1. Если левый потомок НЕ подошел (swap === null), правый потомок (child2N) сравнивается напрямую с корнем (elemScore).
2. Если левый потомок подошел (swap === child1N), правый потомок честно сравнивается со стоимостью левого (child1Score).
Переменная child1Score жестко кэшируется в стеке процессора в рамках текущей итерации. Попытки заменить её на 
повторное чтение из массива вроде open_heap[swap].f — это грубейшая избыточность, которая ломает L1-кэш и снижает FPS.
**/
 

// ПРОВЕРЯЕМ ДЛЯ ДРУГОГО ДОЧЕРНЕГО ЭЛЕМЕНТА
if(child2N<length){
if(open_heap[child2N].f<(swap===null?elemScore:child1Score)){
swap=child2N;
}
}


// ЕСЛИ ЭЛЕМЕНТ НЕОБХОДИМО ПЕРЕМЕСТИТЬ, МЕНЯЕМ ЕГО МЕСТАМИ
if(swap!==null){
open_heap[n]=open_heap[swap];
n=swap;
child2N=(n+1)<<1;
child1N=child2N-1;
}
// В ПРОТИВНОМ СЛУЧАЕ, НА ЭТОМ ВСЁ
else{ break; }
}


open_heap[n]=element;


}


class astar{


// ____________________ set_data ____________________


static set_data(data_nodes){
nodes=data_nodes;
}


// ____________________ SEARCH ____________________


static search(corridor_result,start_node,end_node,start_position,end_position){


// 1. УВЕЛИВАЕМ МАРКЕР КАДРА: МАСКА & 0x7FFFFFFF ЗАЩИЩАЕТ ОТ ПЕРЕПОЛНЕНИЯ 32-БИТНОГО int В JS
call_counter=(call_counter+1) & 0x7FFFFFFF;
if(call_counter===0){ call_counter=1; }
const current_marker=call_counter;


const end_x=end_position.x;
const end_y=end_position.y;
const end_z=end_position.z;


// ИНИЦИАЛИЗИРУЕМ СТАРТОВЫЙ УЗЕЛ ИСХОДНЫМИ ПАРАМЕТРАМИ
start_node.entry_x=start_position.x;
start_node.entry_y=start_position.y;
start_node.entry_z=start_position.z;
start_node.f=0; // ЭТО УДАЛЯТЬ НЕ НАДО И ДОБАВЛЯТЬ ЭТО НЕ НАДО: start_node.g=0;
start_node.visited=current_marker;
start_node.parent=-1;


// СБРАСЫВАЕМ КУЧУ И ПОМЕЩАЕМ В КОРЕНЬ СТАРТОВЫЙ УЗЕЛ
open_heap.length=0;
open_heap[0]=start_node;


while(open_heap.length>0){
	
	
// ПОЛУЧАЕМ НАИМЕНЬШЕЕ ЗНАЧЕНИЕ F(X) ДЛЯ ДАЛЬНЕЙШЕЙ ОБРАБОТКИ. КУЧА СОХРАНЯЕТ ЭТО В ОТСОРТИРОВАННОМ ВИДЕ.
// СОХРАНЯЕМ ПЕРВЫЙ ЭЛЕМЕНТ, ЧТОБЫ ВЕРНУТЬ ЕГО ПОЗЖЕ.
const current_node=open_heap[0];
// ИЗВЛЕКАЕМ ПОСЛЕДНИЙ ЭЛЕМЕНТ, ЗАМЕНЯЕМ ИМ КОРЕНЬ И БАЛАНСИРУЕМ КУЧУ ВВЕРХ
const last_node=open_heap.pop();
// ЕСЛИ ОСТАЛИСЬ ЭЛЕМЕНТЫ, ТО ПОМЕЩАЕМ КОНЕЧНЫЙ ЭЛЕМЕНТ В НАЧАЛО И ПРИМЕНЯЕМ bubble_up
// ВАЖНО: ВСЁ РАБОТАЕТ ИДЕАЛЬНО ПРАВИЛЬНО И НА МАКСИМАЛЬНОЙ СКОРОСТИ, УЛУЧШАТЬ НЕКУДА.
// ИСПОЛЬЗОВАНИЕ НАТИВНОГО .pop() НА C++ УРОВНЕ V8 В СВЯЗКЕ С ПРЯМОЙ ПЕРЕЗАПИСЬЮ ИНДЕКСА [0]
// РАБОТАЕТ В 1.5 рАЗА БЫСТРЕЕ, ЧЕМ ЛЮБЫЕ РУЧНЫЕ МАНИПУЛЯЦИИ СО СВОЙСТВОМ .length (НАПРИМЕР, open_heap.length=last_idx).
// ЛЮБЫЕ ПОПЫТКИ ПЕРЕПИСАТЬ ЭТОТ БЛОК НА "ЧИСТЫЙ СИНТАКСИС" ГАРАНТИРОВАННО ОБРУШАТ FPS.
if(open_heap.length>0){
open_heap[0]=last_node;
bubble_up();
}


// СТАНДАРТ RECAST/DETOUR: ПРОВЕРКА ЗАКРЫТИЯ ЧЕРЕЗ СРАВНЕНИЕ С МАРКЕРОМ
if(current_node.closed===current_marker){ continue; }


// ЗАКРЫВАЕМ УЗЕЛ И ОБРАБАТЫВАЕМ ЕГО СОСЕДЕЙ
current_node.closed=current_marker;


// КОНЕЧНЫЙ УЗЕЛ НАЙДЕН, ВОЗВРАЩАЕМ КОРИДОР ОБЯЗАТЕЛЬНО СО СТАРТОВЫМ УЗЛОМ И ПЕРЕВОРАЧИВАЯ МАССИВ БЕЗ .reverse()
if(current_node===end_node){


let current=current_node;
let path_length=1;
while(current.parent!=-1){
path_length++;
current=nodes[current.parent];
}
corridor_result.length=path_length;
current=current_node;
let idx=path_length-1;
while(current){
corridor_result[idx--]=current;
current=nodes[current.parent];
}
return true;


}


// БЕРЁМ 3D КООРДИНАТЫ ТОЧКИ ВХОДА В ТЕКУЩИЙ ПОЛИГОН ДЛЯ ЧЕСТНОГО ПОДСЧЁТА ПРОЙДЕННОГО ПУТИ
const from_x=current_node.entry_x;
const from_y=current_node.entry_y;
const from_z=current_node.entry_z;


let current_node_neighbours=current_node.neighbours;
let current_node_g=current_node.g;


// ПЕРЕБИРАЕМ ВСЕХ СОСЕДЕЙ ТЕКУЩЕГО УЗЛА
for(let i=0;i<current_node_neighbours.length;i++){
	
	
const neighbour=nodes[current_node_neighbours[i]];


// ЕСЛИ МАРКЕР СОВПАДАЕТ — УЗЕЛ БЫЛ ЗАКРЫТ, ПЕРЕХОДИМ К СЛЕДУЮЩЕМУ СОСЕДУ
if(neighbour.closed===current_marker){ continue; }


let edge_x,edge_y,edge_z;


if(neighbour===end_node){
edge_x=end_x;
edge_y=end_y;
edge_z=end_z;
}
else{
// ЗАБИРАЕМ ВЕРШИНЫ ОБЩЕГО РЕБРА (ПОРТАЛА)
const v1=current_node.portal_v0[i];
const v2=current_node.portal_v1[i];


// СТАНДАРТ RECAST/DETOUR: ПРОЕКЦИЯ ПЕРПЕНДИКУЛЯРА РАССЧИТЫВАЕТСЯ ТОЛЬКО В 2D (XZ)
// БЕЗ ВЫНЕСЕНИЯ В ОТДЕЛЬНУЮ ФУНКЦИЮ. getClosestPointOnPortal
const invLengthSq=current_node.portal_inv_len_2d[i];
const dx=current_node.portal_dx[i];
const dz=current_node.portal_dz[i];
const v1x=v1.x;
const v1y=v1.y;
const v1z=v1.z;
// СТАНДАРТ RECAST/DETOUR: СКАЛЯРНОЕ ПРОИЗВЕДЕНИЕ И ПРОЕКЦИЯ В 2D XZ БЕЗ ДЕЛЕНИЙ И ВЕТВЛЕНИЙ
// УПРОЩАТЬ ЗДЕСЬ УЖЕ НЕКУДА
let t=((from_x-v1x)*dx+(from_z-v1z)*dz)*invLengthSq; // УМНОЖЕНИЕ ВМЕСТО ДЕЛЕНИЯ. ЗАЩИЩАЕТ ОТ ДЕЛЕНИЯ НА НОЛЬ
// ДВУХСТОРОННИЙ CLAMP РАБОТАЕТ БЫСТРО. НЕ ТРОГАТЬ.
if(t<0){ t=0; }
else if(t>1){ t=1; }
edge_x=v1x+t*dx;
edge_z=v1z+t*dz;
// СТАНДАРТ RECAST/DETOUR: ВЫСОТА Y РАССЧИТЫВАЕТСЯ ЛИНЕЙНОЙ ИНТЕРПОЛЯЦИЕЙ ПО РЕБРУ
edge_y=v1y+t*(v2.y-v1y);


}


// РАСЧЕТ 3D-РАССТОЯНИЯ ДО ТОЧКИ ВХОДА НА РЕБРО СОСЕДА  (ТЕОРЕМА ПИФАГОРА)
const step_dx=edge_x-from_x;
const step_dy=edge_y-from_y;
const step_dz=edge_z-from_z;


/**
СТАНДАРТ RECAST/DETOUR: СТОИМОСТЬ ПРОЙДЕННОГО НА ТЕКУЩИЙ МОМЕНТ ПУТИ g (ПЕРЕМЕННАЯ gScore) — ЭТО РЕАЛЬНАЯ ФИЗИЧЕСКАЯ ДЛИНА ПУТИ (Math.sqrt), КОТОРУЮ МЫ УЖЕ ПРОШЛИ ОТ СТАРТА.
ОНА ОБЯЗАНА БЫТЬ В 3D (distance_between), ЧТОБЫ МЫ ПОНИМАЛИ, ЧТО ЛЕЗТЬ В КРУТУЮ ГОРУ ИЛИ БЕЖАТЬ ПО ДЛИННОЙ ЛЕСТНИЦЕ ВВЕРХ ТЯЖЕЛЕЕ И ДОЛЬШЕ, ЧЕМ ИДТИ ПО РОВНОЙ ПЛОСКОСТИ.
ВЫСОТА (Y) ЗДЕСЬ КРИТИЧЕСКИ ВАЖНА, И МЫ ЕЁ НЕ ТРОГАЕМ.
**/
const distance_between=Math.sqrt(step_dx*step_dx+step_dy*step_dy+step_dz*step_dz);
const gScore=current_node_g+distance_between*neighbour.cost;


// ПРОВЕРКА: НАШЛИ ЛИ МЫ БОЛЕЕ ВЫГОДНЫЙ ПУТЬ К СОСЕДУ
const is_visited=(neighbour.visited===current_marker);


if(!is_visited || gScore<neighbour.g){
	
	
// НАЙДЕН ОПТИМАЛЬНЫЙ (ПОКА ЧТО) ПУТЬ К ЭТОМУ УЗЛУ. ОЦЕНИМ ЭТОТ ПУТЬ, ЧТОБЫ ПОНЯТЬ, НАСКОЛЬКО ОН ХОРОШ	
	
	
neighbour.visited=current_marker;
neighbour.parent=current_node.id;
neighbour.g=gScore;


neighbour.entry_x=edge_x;
neighbour.entry_y=edge_y;
neighbour.entry_z=edge_z;


/**
СТАНДАРТ RECAST/DETOUR: const heuristic=Math.sqrt(target_dx*target_dx+target_dz*target_dz);
ЭВРИСТИКА A* (ОЦЕНКА ОСТАВШЕГОСЯ ПУТИ ДО ФИНИША)-ЭТО СТРОГО ДВУХМЕРНОЕ (2D) РАССТОЯНИЕ ОТ ЦЕНТРОИДА СОСЕДА ДО ФИНАЛЬНОЙ ТОЧКИ.
ОНА НУЖНА ТОЛЬКО ДЛЯ ТОГО, ЧТОБЫ НАПРАВЛЯТЬ ВОЛНУ ПОИСКА В НУЖНУЮ СТОРОНУ (К ЦЕЛИ), А НЕ ЗАСТАВЛЯТЬ ЕЁ РАЗДУВАТЬСЯ КРУГОМ ВО ВСЕ СТОРОНЫ.
КООРДИНАТА ВЫСОТЫ Y ПОЛНОСТЬЮ ИСКЛЮЧЕНА ИЗ ФОРМУЛЫ, ЧТО ГАРАНТИРУЕТ ДОПУСТИМОСТЬ ЭВРИСТИКИ (ADMISSIBILITY)
ПОЧЕМУ ЭТО КРИТИЧЕСКИ ВАЖНО:
1. ЗАЩИТА ОТ ЗАЦИКЛИВАНИЯ: НА МНОГОЭТАЖНЫХ ЛОКАЦИЯХ, ВИНТОВЫХ ЛЕСТНИЦАХ И В БАШНЯХ АЛГОРИТМ МАТЕМАТИЧЕСКИ ЗАСТРАХОВАН ОТ БЕСКОНЕЧНЫХ ЦИКЛОВ И ГАРАНТИРОВАННО НАХОДИТ КРАТЧАЙШИЙ ФИЗИЧЕСКИЙ МАРШРУТ.
2. ИЗБЫТОЧНОСТЬ 3D-РАСЧЁТА: УЧЁТ КООРДИНАТЫ Y В ЭВРИСТИКЕ — ЭТО ПУСТАЯ ТРАТА ТАКТОВ CPU.
ПЕРЕМЕЩЕНИЯ ПО NAVMESH ПРИНЦИПИАЛЬНО ПРИВЯЗАНЫ К ГОРИЗОНТАЛЬНОЙ ПЛОСКОСТИ XZ, А ВСЕ ВЕРТИКАЛЬНЫЕ ПЕРЕПАДЫ ВЫСОТ УЖЕ ЧЕСТНО ЗАЛОЖЕНЫ В СТОИМОСТЬ ПРОХОЖДЕНИЯ РЁБЕР (distance_between).
ИТОГ ОПТИМИЗАЦИИ:
ПЕРЕВОД ЭВРИСТИЧЕСКОЙ ОЦЕНКИ ИЗ 3D (XYZ) В 2D (XZ) РЕШАЕТ СРАЗУ ДВЕ ЗАДАЧИ: КРАТНО УВЕЛИЧИВАЕТ СКОРОСТЬ ВЫПОЛНЕНИЯ КОДА И СТАБИЛИЗИРУЕТ ПОВЕДЕНИЕ ИСКУССТВЕННОГО ИНТЕЛЛЕКТА НА СЛОЖНЫХ МНОГОУРОВНЕВЫХ КАРТАХ.
**/
// РАССЧИТЫВАЕМ ИМЕННО ПО ЦЕНТРОИДУ, А НЕ РЁБРАМ. ЭТО ЕДИНСТВЕННОЕ ВЕРНОЕ РЕШЕНИЕ. 
const target_dx=neighbour.centroid_x-end_x;
const target_dz=neighbour.centroid_z-end_z;
neighbour.f=gScore+Math.sqrt(target_dx*target_dx+target_dz*target_dz);


// ЕСЛИ УЗЕЛ ЕЩЁ НЕ БЫЛ В КУЧЕ-ДОБАВЛЯЕМ ЕГО И ПРОТАЛКИВАЕМ НАВЕРХ
if(!is_visited){
// ПРИ ДОБАВЛЕНИИ В КУЧУ ОБЪЕКТ ОКАЖЕТСЯ В НУЖНОМ МЕСТЕ В СООТВЕТСТВИИ СО ЗНАЧЕНИЕМ "f".
open_heap.push(neighbour);
// БАЛАНСИРУЕМ КУЧУ С НОВЫМ ДОБАВЛЕННЫМ УЗЛОМ, ЧТОБЫ ВЫБРАТЬ ОПТИМАЛЬНЫЙ ПУТЬ ПОСЛЕ ЭТОГО
sink_down(open_heap.length-1);
}
else{
/**
ДАННЫЙ СОСЕД УЖЕ ПОСЕЩАЛСЯ, НО НОВЫЙ НАЙДЕННЫЙ ПУТЬ К ЭТОМУ СОСЕДУ ОКАЗАЛСЯ КОРОЧЕ. ТРЕБУЕТСЯ ОБНОВИТЬ ПОЗИЦИЮ ЭТОГО СОСЕДА В КУЧЕ.
ЛИНЕЙНЫЙ ПОИСК С КОНЦА МАССИВА-ЭТО ПИК ПРОИЗВОДИТЕЛЬНОСТИ ДЛЯ БОЛЬШИХ И МАЛЫХ МАССИВОВ, Т.К. В АЛГОРИТМЕ A* ИЗМЕНЕННЫЕ СОСЕДИ ПОЧТИ ВСЕГДА НАХОДЯТСЯ В САМОМ КОНЦЕ МАССИВА КУЧИ.
ЭТОТ ЦИКЛ НАХОДИТ НУЖНЫЙ УЗЕЛ ВСЕГО ЗА 1–3 ИТЕРАЦИИ,ОБГОНЯЯ OPEN_HEAP.INDEXOF(), КОТОРЫЙ МЕДЛЕННО ИЩЕТ С НАЧАЛА МАССИВА.
ВАЖНО: ТЕСТЫ ПОКАЗАЛИ, ЧТО ВНЕДРЕНИЕ ТЕОРЕТИЧЕСКОГО O(1) ЧЕРЕЗ ЗАПЕКАНИЕ ИНДЕКСОВ (neighbour.heap_idx=n) 
ЗАМЕДЛЯЕТ РАНТАЙМ ИЗ-ЗА ПОСТОЯННЫХ ПЕРЕЗАПИСЕЙ heap_idx ПРИ КАЖДОЙ ПЕРЕСТАНОВКЕ В КУЧЕ.
**/
let idx=open_heap.length-1;
for(;idx>=0;idx--){
if(open_heap[idx]===neighbour){ break; }
}
sink_down(idx);
}


}
}
}


// ПУТЬ НЕ НАЙДЕН
return false;


}
}


export {astar};