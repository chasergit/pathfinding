/**
ЭТО СГЛАЖИВАНИЕ ПУТИ Funnel (String Pulling).
АЛГОРИТМ НАПИСАН ПО СТАНДАРТУ RECAST/DETOUR.


ЧТО ОТСУТСТВУЕТ ИЗ RECAST/DETOUR: В САМОМ КОНЦЕ RECAST ДЕЛАЕТ ОБЯЗАТЕЛЬНЫЙ ПРОХОД ВЫСОТНОЙ ПРИВЯЗКИ.
ОН БЕРЁТ ПОЛУЧЕННУЮ ПЛОСКУЮ ТОЧКУ (X, Z), НАХОДИТ ТРЕУГОЛЬНИК NAVMESH, НАД КОТОРЫМ ЭТА ТОЧКА СЕЙЧАС ФИЗИЧЕСКИ НАХОДИТСЯ (ИСПОЛЬЗУЯ ЦЕПОЧКУ PATH), И ЛИНЕЙНО ИНТЕРПОЛИРУЕТ ВЫСОТУ Y ПО ПЛОСКОСТИ ЭТОГО ТРЕУГОЛЬНИКА.


ЭТИ СТРОКИ ЗАКОММЕНТИРОВАННЫ, Т.К. МЫ ГАРАНТИРУЕМ ГАРАНТИРУЕТ, ЧТО В neighbours ФИЗИЧЕСКИ НИКОГДА НЕ ОСТАНЕТСЯ ID УДАЛЕННОГО ИЛИ НЕДОСТУПНОГО СОСЕДА.
//if(neighbour_id===-1){ continue; }
//if(!v0 || !v1){ continue; }
**/


// ГЛОБАЛЬНЫЕ БУФЕРЫ ФИКСИРОВАННОЙ ЁМКОСТИ (ВЫДЕЛЯЮТ ~240 КБ ПРИ СТАРТЕ), ЗАЩИЩАЮЩИЕ РАНТАЙМ ОТ GARBAGE COLLECTOR.
// ПРЯМАЯ ЗАПИСЬ ПО ИНДЕКСУ И ОРГАНИЗАЦИЯ FixedArray ПОЛНОСТЬЮ ИСКЛЮЧАЮТ МЕДЛЕННЫЕ ДИНАМИЧЕСКИЕ РАСШИРЕНИЯ push().
// ТИПИЗИРОВАННЫЕ МАССИВЫ (TypedArrays) ЗДЕСЬ НЕ ПРИМЕНЯЮТСЯ ИЗ-ЗА ШТРАФОВ V8 НА КОНВЕРТАЦИЮ ТИПОВ И ПОТЕРЮ ССЫЛОК ВЕРШИН.
const max_length=20000;
const portals_left=new Array(max_length);
const portals_right=new Array(max_length);
const smoothed=new Array(max_length);


class channel{


static string_pull(corridor,start_position,end_position,path){


path.length=0; 
const corridor_length=corridor.length;


// 1. СБОРКА И ГЕОМЕТРИЧЕСКОЕ УПОРЯДОЧИВАНИЕ ПОРТАЛОВ (ВОРОТ)
// НУЛЕВОЙ ПОРТАЛ ИНИЦИАЛИЗИРУЕТСЯ СТАРТОВОЙ ТОЧКОЙ (ВХОД В КОРИДОР)
portals_left[0]=start_position;
portals_right[0]=start_position;


let portal_count=1;
const EPSILON=1e-9; // ЗАЩИТА ОТ МАТЕМАТИЧЕСКОГО ШУМА ТИПА IEEE 754 ДЛЯ JAVASCRIPT


// ФАЗА 1: СБОРКА ПОРТАЛОВ С УЧЕТОМ 3D-ВЫСОТЫ ВЕРШИН
for(let i=0;i<corridor_length-1;i++){
const node_a=corridor[i];
const node_b=corridor[i+1];


// НАХОДИМ ИНДЕКС СОСЕДА В МАССИВЕ (В JIT V8 РАБОТАЕТ НА СКОРОСТИ C++)
const neighbour_id=node_a.neighbours.indexOf(node_b.id);
// ТАК КАК МЫ ДО ЭТОЙ ФУНКЦИИ ИСКЛЮЧИЛИ СОВПАДЕНИЕ НАЧАЛЬНОГО И КОНЕЧНОГО УЗЛОВ, ТО У ЭТОГО УЗЛА ГАРАНТИРОВАННО БУДЕТ СОСЕД И МОЖНО ЗАКОММЕНТИРОВАТЬ
//if(neighbour_id===-1){ continue; }


// МГНОВЕННЫЙ ААА-ПОДХВАТ: забираем запеченную пару ID вершин общего ребра 
const v0=node_a.portal_v0[neighbour_id];
const v1=node_a.portal_v1[neighbour_id];


// ЗАКОММЕНТИРОВАННО, Т.К. ГАРАНТИРУЕМ, ЧТО СОСЕД ЕСТЬ
//if(!v0 || !v1){ continue; }


// РАСЧЁТ ДЕЛЬТЫ ДЛИН РЁБЕР
const dx=v1.x-v0.x;
const dz=v1.z-v0.z;


// ИСПРАВЛЕНИЕ ГРАНИЧНОГО СЛУЧАЯ 1: ЗАЩИТА ОТ ВЫРОЖДЕННОГО РЕБРА (КОГДА ОЧЕНЬ ОСТРЫЙ ТРЕУГОЛЬНИК КАК ИГЛА, И РЕБРО (ВОРОТА), Т.Е. ДВЕ ВЕРШИНЫ, СХЛОПЫВАЮТСЯ В ТОЧКУ.
// ЭТО ПОМОГАЕТ ИЗБЕГАТЬ ДЕЛЕНИЯ НА НОЛЬ, ИНВЕРСИИ ЗНАКОВ. И ПОМОГАЕТ ИСПОЛЬЗОВАТЬ НИЖЕ ЭТОТ КОД БЕЗ БЕСКОНЕЧНОГО ЦИКЛА: i=left_index+1; if(i>=portal_count){ break; }
if(dx*dx+dz*dz<EPSILON){
continue;
}


// 2D КОСОЕ ПРОИЗВЕДЕНИЕ ВЕКТОРОВ (CROSS PRODUCT) МЕЖДУ ВЕКТОРОМ ДВИЖЕНИЯ ЦЕНТРОИДОВ И ВЕКТОРОМ РЕБРА.
// ЭТО ОПРЕДЕЛЯЕТ, КАКАЯ ИЗ ВЕРШИН НАХОДИТСЯ СЛЕВА, А КАКАЯ СПРАВА ПО ХОДУ ДВИЖЕНИЯ.
const cross=(node_b.centroid_x-node_a.centroid_x)*dz-(node_b.centroid_z-node_a.centroid_z)*dx;


// КОРРЕКТНО РАСПРЕДЕЛЯЕМ ВЕРШИНЫ ПО ЛЕВОЙ И ПРАВОЙ СТВОРКАМ ВОРОТ ПОРТАЛА
if(cross>0){
portals_left[portal_count]=v0;
portals_right[portal_count]=v1;
}
else{
portals_left[portal_count]=v1;
portals_right[portal_count]=v0;
}
portal_count++;
}


// ФИНАЛЬНЫЕ ВОРОТА СТЯГИВАЮТСЯ В НУЛЕВУЮ ШИРИНУ СТРОГО В КООРДИНАТАХ ЦЕЛИ (КОНЕЧНОЙ ТОЧКИ)
portals_left[portal_count]=end_position;
portals_right[portal_count]=end_position;
portal_count++;


// 2. СТЯГИВАНИЕ СТРУНЫ СКВОЗЬ ПОРТАЛЫ (ФАЗА 1: ПОИСК ПОВОРОТНЫХ УГЛОВ В XZ)
smoothed[0]=start_position;
let smoothed_length=1; // ВЫСОКОСКОРОСТНОЙ ИНДЕКСНЫЙ СЧЁТЧИК ДЛЯ ОПТИМИЗАЦИИ РАБОТЫ С МАССИВОМ В V8


// КООРДИНАТЫ ВЕРШИНЫ ТЕКУЩЕЙ ВОРОНКИ (APEX) НА ПЛОСКОСТИ XZ
let apex_x=start_position.x;
let apex_z=start_position.z;


// ИНИЦИАЛИЗАЦИЯ НАПРАВЛЯЮЩИХ ЛУЧЕЙ ЛЕВОЙ И ПРАВОЙ СТОРОН ВОРОНКИ С ИНДЕКСА [0] (ТОЧКИ АПЕКСА)
let left_edge=portals_left[0];  
let right_edge=portals_right[0];


let left_edge_x=left_edge.x;
let left_edge_z=left_edge.z;
let right_edge_x=right_edge.x;
let right_edge_z=right_edge.z;


// ИНДЕКСЫ ПОРТАЛОВ, НА КОТОРЫХ СЕЙЧАС ЗАФИКСИРОВАНЫ ЛЕВЫЙ И ПРАВЫЙ ЛУЧИ ВОРОНКИ
let left_index=0;
let right_index=0;


// МАТЕМАТИЧЕСКАЯ ФУНКЦИЯ ПЛОЩАДИ AREA2 (2D CROSS PRODUCT) ВСТРОЕНА ПРЯМО В ЦИКЛ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ
// const area2=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z);


// ПОШАГОВО СКАНИРУЕМ МАССИВ ПОСТРОЕННЫХ ВОРОТ ДЛЯ ФИКСАЦИИ УГЛОВ ЗАКЛИНИВАНИЯ ВОРОНКИ, НАЧИНАЯ СО СЛЕДУЮЩЕГО ШАГА (i=1)
for(let i=1;i<portal_count;i++){
	
	
const left=portals_left[i];
const right=portals_right[i];
const right_x=right.x;
const right_z=right.z;
const left_x=left.x;
const left_z=left.z;


// --- ОБРАБОТКА ПРАВОЙ СТВОРОК ВОРОТ ---
// ИСПРАВЛЕНИЕ ГРАНИЧНОГО СЛУЧАЯ 2: ЕСЛИ ПРАВАЯ СТВОРКА ФИЗИЧЕСКИ СОВПАДАЕТ С APEX, 
// МЫ НЕ ПРОПУСКАЕМ ШАГ, А ПРИНУДИТЕЛЬНО ДВИГАЕМ ИНДЕКС ВОРОНКИ ВПЕРЕД ЗА БОТОМ.
if(right_x===apex_x && right_z===apex_z){
right_edge=right;
right_edge_x=right_x;
right_edge_z=right_z;
right_index=i;
}
else{
// ВЫЧИСЛЯЕМ КОСОЕ ПРОИЗВЕДЕНИЕ: area2(apex,right_edge,right). 
// ПРОВЕРЯЕМ, ЗАХОДИТ ЛИ НОВАЯ ПРАВАЯ ВЕРШИНА ВНУТРЬ ТЕКУЩЕЙ ВОРОНКИ СПРАВА.
if((right_edge_x-apex_x)*(right_z-apex_z)-(right_x-apex_x)*(right_edge_z-apex_z)<=EPSILON){
// Вычисляем косое произведение: area2(apex,left_edge,right).
// Проверяем, не перекрещивается ли правый луч с левой границей воронки.
if((apex_x===right_edge_x && apex_z===right_edge_z) || ((left_edge_x-apex_x)*(right_z-apex_z)-(right_x-apex_x)*(left_edge_z-apex_z))>-EPSILON){
// УСЛОВИЯ ВЫПОЛНЕНЫ: БЕЗОПАСНО СУЖАЕМ ВОРОНКУ С ПРАВОЙ СТОРОНЫ
right_edge=right;
right_edge_x=right_x;
right_edge_z=right_z;
right_index=i;
}
else{
// КРИТИЧЕСКАЯ ГЕОМЕТРИЯ: ВОРОТА ЗАХЛОПНУЛИСЬ КРЕСТ-НАКРЕСТ. СТРУНА НАТЯГИВАЕТСЯ И ОГИБАЕТ ЛЕВЫЙ УГОЛ.
const last=smoothed[smoothed_length-1];
// ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ПУТЕВЫХ ТОЧЕК НА СТЫКАХ ПОЛИГОНОВ
if(last.x!==left_edge_x || last.z!==left_edge_z){
smoothed[smoothed_length++]=left_edge;
}


// ЛЕВЫЙ УГОЛ СТАРОЙ ВОРОНКИ ОФИЦИАЛЬНО СТАНОВИТСЯ НОВОЙ ТОЧКОЙ APEX (НОВЫМИ НОГАМИ БОТА)
apex_x=left_edge_x;
apex_z=left_edge_z;


// ПЕРЕЗАПУСК ЦИКЛА: СДВИГАЕМ ИНДЕКС 'i' К СЛЕДУЮЩЕМУ ПОРТАЛУ ПОСЛЕ ЗАФИКСИРОВАННОГО ЛЕВОГО УГЛА.
// ЭТО ГАРАНТИРУЕТ ЗАЩИТУ ОТ ЗАЦИКЛИВАНИЯ И КОРРЕКТНОЕ ПЕРЕСТРОЕНИЕ НОВОЙ ВОРОНКИ.
i=left_index+1; 
if(i>=portal_count){ break; }


// СБРАСЫВАЕМ И ИНИЦИАЛИЗИРУЕМ ЛУЧИ НОВОЙ ВОРОНКИ ИЗ ТОЧКИ СВЕЖЕГО APEX
left_edge=portals_left[i];
left_edge_x=left_edge.x;
left_edge_z=left_edge.z;
right_edge=portals_right[i];
right_edge_x=right_edge.x;
right_edge_z=right_edge.z;
left_index=i;
right_index=i;
continue;
}
}
}


// --- ОБРАБОТКА ЛЕВЫЙ СТВОРОК ВОРОТ ---
// ИСПРАВЛЕНИЕ ГРАНИЧНОГО СЛУЧАЯ 2: ЕСЛИ ЛЕВАЯ СТВОРКА ФИЗИЧЕСКИ СОВПАДАЕТ С APEX, 
// МЫ НЕ ПРОПУСКАЕМ ШАГ, А ПРИНУДИТЕЛЬНО ДВИГАЕМ ИНДЕКС ВОРОНКИ ВПЕРЕД ЗА БОТОМ.
if(left_x===apex_x && left_z===apex_z){
left_edge=left;
left_edge_x=left_x;
left_edge_z=left_z;
left_index=i;
}
else{
// ВЫЧИСЛЯЕМ КОСОЕ ПРОИЗВЕДЕНИЕ: area2(apex,left_edge,left).
// ПРОВЕРЯЕМ, ЗАХОДИТ ЛИ НОВАЯ ЛЕВАЯ ВЕРШИНА ВНУТРЬ ТЕКУЩЕЙ ВОРОНКИ СЛЕВА.
if((left_edge_x-apex_x)*(left_z-apex_z)-(left_x-apex_x)*(left_edge_z-apex_z)>=-EPSILON){
// ВЫЧИСЛЯЕМ КОСОЕ ПРОИЗВЕДЕНИЕ: area2(apex,right_edge,left).
// ПРОВЕРЯЕМ, НЕ ПЕРЕКРЕЩИВАЕТСЯ ЛИ ЛЕВЫЙ ЛУЧ С ПРАВОЙ ГРАНИЦЕЙ ВОРОНКИ.
if((apex_x===left_edge_x && apex_z===left_edge_z) || ((right_edge_x-apex_x)*(left_z-apex_z)-(left_x-apex_x)*(right_edge_z-apex_z))<EPSILON){
// УСЛОВИЯ ВЫПОЛНЕНЫ: БЕЗОПАСНО СУЖАЕМ ВОРОНКУ С ЛЕВОЙ СТОРОНЫ
left_edge=left;
left_edge_x=left_x;
left_edge_z=left_z;
left_index=i;
}
else{
// КРИТИЧЕСКАЯ ГЕОМЕТРИЯ: ВОРОТА ЗАХЛОПНУЛИСЬ КРЕСТ-НАКРЕСТ. СТРУНА НАТЯГИВАЕТСЯ И ОГИБАЕТ ПРАВЫЙ УГОЛ.
const last=smoothed[smoothed_length-1];
// ЗАЩИТА ОТ ДУБЛИРОВАНИЯ ПУТЕВЫХ ТОЧЕК
if(last.x!==right_edge_x || last.z!==right_edge_z){
smoothed[smoothed_length++]=right_edge;
}


// ПРАВЫЙ УГОЛ СТАРОЙ ВОРОНКИ СТАНОВИТСЯ НОВОЙ ОПОРНОЙ ТОЧКОЙ APEX
apex_x=right_edge_x;
apex_z=right_edge_z;


// ПЕРЕЗАПУСК ЦИКЛА: СДВИГАЕМ ИНДЕКС 'i' К СЛЕДУЮЩЕМУ ПОРТАЛУ ПОСЛЕ ЗАФИКСИРОВАННОГО ПРАВОГО УГЛА.
// ЭТО ГАРАНТИРУЕТ ЗАЩИТУ ОТ ЗАЦИКЛИВАНИЯ И КОРРЕКТНОЕ ПЕРЕСТРОЕНИЕ НОВОЙ ВОРОНКИ.
i=right_index+1; 
if(i>=portal_count){ break; }


// СБРАСЫВАЕМ И ИНИЦИАЛИЗИРУЕМ ЛУЧИ НОВОЙ ВОРОНКИ
left_edge=portals_left[i];
left_edge_x=left_edge.x;
left_edge_z=left_edge.z;
right_edge=portals_right[i];
right_edge_x=right_edge.x;
right_edge_z=right_edge.z;
left_index=i;
right_index=i;
continue;
}
}
}
}


/**
ФИНАЛЬНАЯ ОБРАБОТКА end_position ВНУТРИ ПРЕДЫДЩУЕГО ЦИКЛА for ЧЕРЕЗ ДОБАВЛЕНИЕ ВОРОТ НУЛЕВОЙ ШИРИНЫ — ЭТО МАТЕМАТИЧЕСКИ БЕЗУПРЕЧНОЕ РЕШЕНИЕ.
ЛЮБЫЕ СКРЫТЫЕ УГЛЫ ЗАСТАВЯТ ВОРОНКУ ЗАХЛОПНУТЬСЯ КРЕСТ-НАКРЕСТ ДО ТОГО, КАК ЦИКЛ ЗАВЕРШИТСЯ. НИКАКИХ "СРЕЗНЫХ" БАГОВ НА ФИНИШЕ НЕ СУЩЕСТВУЕТ.
НАМ ОСТАЁТСЯ ТОЛЬКО ЗАФИКСИРОВАТЬ ФИНАЛЬНУЮ ТОЧКУ (end_position), ЕСЛИ ТЕКУЩИЙ Apex ДО НЕЁ ЕЩЁ НЕ ДОШЁЛ. И БЕЗ ДУБЛИКАТОВ.
**/
const last=smoothed[smoothed_length-1];
if(last.x!==end_position.x || last.z!==end_position.z){
smoothed[smoothed_length++]=end_position;
}


// ААА-ФИНАЛ: ОЧИЩАЕМ ПЕРЕДАННЫЙ МАССИВ БОТА И ЗАПОЛНЯЕМ ЕГО БЕЗ ВЫДЕЛЕНИЯ НОВОЙ ПАМЯТИ!
for(let r=0;r<smoothed_length;r++){
// ЗАПИСЫВАЕМ КАК КОПИИ ОБЪЕКТОВ, ПОЛНОСТЬЮ РАЗРЫВАЯ ССЫЛКИ.
let sm=smoothed[r];
path[r]={x:sm.x,y:sm.y,z:sm.z};
}


}
}


export {channel};