import * as THREE from "three";


/**


// ДЛЯ КАЖДОЙ КАРТЫ ЗНАЧЕНИЯ navigation_detail_mesh_climb И navigation_detail_mesh_height МОГУТ ОТЛИЧАТЬСЯ. ЧТОБЫ ВЫСТАВИТЬ ВЕРНЫЕ, СМОТРЕТЬ НА КАРТУ И ПРИМЕРНО ВЫЧИСЛЯТЬ ВЫСОТЫ
navigation_detail_mesh_climb СТАВИТЬ С ЗАПАСОМ +0.01. МАКСИМАЛЬНАЯ ВЫСОТА ОТ ТРЕУГОЛЬНИКА DETAIL MESH ДО НАВИГАЦИОННОЙ СЕТКИ. КОГДА ТРЕУГОЛЬНИК НАХОДИТСЯ ПОД НАВИГАЦИОННОЙ СЕТКОЙ
navigation_detail_mesh_height СТАВИТЬ С ЗАПАСОМ +0.01. МАКСИМАЛЬНАЯ ВЫСОТА ОТ ТРЕУГОЛЬНИКА DETAIL MESH ДО НАВИГАЦИОННОЙ СЕТКИ. КОГДА ТРЕУГОЛЬНИК НАХОДИТСЯ НАД НАВИГАЦИОННОЙ СЕТКОЙ


В функции move_along_surface стоит отталкивание от стен со значениями 0.0001 и 0.9999 — это финальный, полностью безопасный вариант. Бот не застрянет и не упадёт.
Отталкивание 0.0001 процент не надо менять на смещение в 0.1мм. Здесь надо именно процент, чтобы на треугольнике в 100м было отталкивание в 1см, а не 0.1мм.
Отталкивание должно быть пропорционально размеру треугольника, поэтому используем процент.
Если бот движется со скоростью 0.01мм, то он не застрянет при отталкивании от стены треугольника, размером в 100 метров.
Отталкивание добавлено, чтобы при ходьбе на краю пропасти или стены из-за погрешности, бот не вышел за ребро. 
Поэтому если не разрешено идти в пропасть, то бот всегда находит под собой треугольник первой же функцией проверки нахождения точки в треугольнике.
1. Нет бага "Гигантских координат".
Чтобы микро-отступ 0.0001 м из-за округления процессора превратился в ноль, боту нужно убежать от центра сцены (0,0,0) на расстояние более 450 миллиардов метров.
2. Баг "Микроскопической геометрии".
Если на карте треугольник NavMesh размером с пуговицу (например, шириной 0.0005 метра), то ограничение 0.0001 и 0.9999 просто "сожрёт" всю длину ребра, и бот не сможет развернуться на этом треугольнике.
Решение: при запекании NavMesh выставлять минимальный размер ячейки (Min Region Size) хотя бы в 10–20 сантиметров. Навигационной сетке не нужна микроскопическая детализация.


**/


/**
ОТСТУП ПО ВЫСОТЕ ДЛЯ ФИЗИКИ RAPIER.JS РАВНЫЙ createCharacterController(0.01);
ЕСЛИ ПОСТАВИТЬ get_detail_mesh_y_offset=0, ТО ПРИ ВКЛЮЧЕНИИ ФИЗИКИ БУДЕТ ВИДНО КАК ПЕРСОНАЖ НА 0.01М ПЛАВНО ИЛИ РЕЗКО ПОДНИМАЕТСЯ ВВЕРХ
**/
let get_detail_mesh_y_offset=0.01;


// БЕРЁМ ИЗ RAPIER.JS
let physics_QueryFilterFlags_EXCLUDE_FIXED=1; 
let physics_QueryFilterFlags_EXCLUDE_KINEMATIC=2;
let physics_QueryFilterFlags_EXCLUDE_DYNAMIC=4;
let physics_QueryFilterFlags_EXCLUDE_SENSORS=8;
let physics_QueryFilterFlags_EXCLUDE_SOLIDS=16;
let physics_QueryFilterFlags_ONLY_DYNAMIC=3;
let physics_QueryFilterFlags_ONLY_KINEMATIC=5;
let physics_QueryFilterFlags_ONLY_FIXED=6;


/** ____________________ ОСТАЛЬНОЕ НАСТРАИВАТЬ НЕ НАДО ____________________ **/


let agents={};


let nodes;
let vertices;
let nodes_2;
let groups;
let detail_mesh_nodes;


let navigation_spatial_shift_x=17179869184; // 2^34
let navigation_spatial_shift_z=131072; // 2^17
let navigation_spatial_offset=65536; // СИММЕТРИЧНЫЙ СДВИГ ВО ВСЕ СТОРОНЫ КУБА


// БУФЕР ДЛЯ СБОРА ТРЕУГОЛЬНИКОВ НА ОДИН КАДР
let navigation_grid_found_nodes=new Int32Array(10000);
let navigation_grid_found_count=0;
// МАССИВ ФЛАГОВ УНИКАЛЬНОСТИ. ИНДЕКСИРУЕТСЯ ПО ID ТРЕУГОЛЬНИКА (ДО 1 000 000)
let navigation_grid_nodes_visited_flags=new Int32Array(1000000); 
let navigation_grid_search_id=0;


let navigation_grid_cells_size_xz;
let navigation_grid_cells_size_y;


let navigation_grid_cells_array;
let navigation_grid_cells_count;


// ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК В МЕТРАХ
let navigation_grid_cells_min_x_meter; // LEFT
let navigation_grid_cells_max_x_meter; // RIGHT
let navigation_grid_cells_min_z_meter; // TOP
let navigation_grid_cells_max_z_meter; // BOTTOM
let navigation_grid_cells_min_y_meter; // LOW, DOWN
let navigation_grid_cells_max_y_meter; // HIGH, UP


// ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК В НОМЕРАХ ЯЧЕЕК
let navigation_grid_cells_min_x_num; // LEFT
let navigation_grid_cells_max_x_num; // RIGHT
let navigation_grid_cells_min_z_num; // TOP
let navigation_grid_cells_max_z_num; // BOTTOM
let navigation_grid_cells_min_y_num; // LOW, DOWN
let navigation_grid_cells_max_y_num; // HIGH, UP


let navigation_detail_mesh_climb=0;
let navigation_detail_mesh_height=0;


// БУФЕР ДЛЯ СБОРА ТРЕУГОЛЬНИКОВ НА ОДИН КАДР
let navigation_detail_mesh_found_nodes=new Int32Array(10000);
let navigation_detail_mesh_found_count=0;
// МАССИВ ФЛАГОВ УНИКАЛЬНОСТИ. ИНДЕКСИРУЕТСЯ ПО ID ТРЕУГОЛЬНИКА (ДО 1 000 000)
let navigation_detail_mesh_nodes_visited_flags=new Int32Array(1000000); 
let navigation_detail_mesh_search_id=0;


let navigation_detail_mesh_cells_size_xz;
let navigation_detail_mesh_cells_size_y;


let navigation_detail_mesh_cells_array;
let navigation_detail_mesh_cells_count;


// ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК В МЕТРАХ
let navigation_detail_mesh_cells_min_x_meter; // LEFT
let navigation_detail_mesh_cells_max_x_meter; // RIGHT
let navigation_detail_mesh_cells_min_z_meter; // TOP
let navigation_detail_mesh_cells_max_z_meter; // BOTTOM
let navigation_detail_mesh_cells_min_y_meter; // LOW, DOWN
let navigation_detail_mesh_cells_max_y_meter; // HIGH, UP


// ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК В НОМЕРАХ ЯЧЕЕК
let navigation_detail_mesh_cells_min_x_num; // LEFT
let navigation_detail_mesh_cells_max_x_num; // RIGHT
let navigation_detail_mesh_cells_min_z_num; // TOP
let navigation_detail_mesh_cells_max_z_num; // BOTTOM
let navigation_detail_mesh_cells_min_y_num; // LOW, DOWN
let navigation_detail_mesh_cells_max_y_num; // HIGH, UP


let physics_movement_vector={x:0,y:0,z:0};
let physics_translation={x:0,y:0,z:0};
let physics_final={x:0,y:0,z:0};


let physics_castShape_position={x:0,y:0,z:0};
let physics_castShape_rotation={w:1,x:0,y:0,z:0};
let physics_castShape_velocity={x:0,y:-1,z:0};


// ДОСТАТОЧНО 1000000 ТРЕУГОЛЬНИКОВ КАРТЫ
let move_along_surface_search_nodes=new Array(1000000); 
let move_along_surface_visited_flags=new Int32Array(1000000); 
let move_along_surface_queue=[];
let move_along_surface_search_id=0;
let move_along_surface_pool_idx=0;
let move_along_surface_search_position={x:0,y:0,z:0};


let move_along_surface_result={
success:true,
position:{x:0,y:0,z:0},
node_id:-1,
visited_length:0,
visited:new Int32Array(10000) // ЛИМИТ В 10000 ПРОЙДЕННЫХ ТРЕУГОЛЬНИКОВ ЗА 1 КАДР ДОСТАТОЧЕН
};


let move_along_surface_distance_point_to_segment_squared_2d_result={distance_square:0,t:0};


// ДОСТАТОЧНО 30000 ОБЪЕКТОВ ДЛЯ ОБХОДА ЗА 1 КАДР
let move_along_surface_nodes_pool=Array.from({length:30000},()=>({
node_id:-1,
parent_node_id:null
}));


/** ____________________ MOVE_ALONG_SURFACE_DISTANCE_POINT_TO_SEGMENT_SQUARED_2D_RAW ____________________ **/


function move_along_surface_distance_point_to_segment_squared_2d_raw(out,point,px,pz,qx,qz){


const pqx=qx-px;
const pqz=qz-pz;
const dx=point.x-px;
const dz=point.z-pz;


const d=pqx*pqx+pqz*pqz;
let t=pqx*dx+pqz*dz;
if(d>0){ t/=d; }
if(t<0){ t=0; }
else if(t>1){ t=1; }


const closest_x=px+t*pqx;
const closest_z=pz+t*pqz;
const distance_x=closest_x-point.x;
const distance_z=closest_z-point.z;
out.distance_square=distance_x*distance_x+distance_z*distance_z;
out.t=t;


}


/** ____________________ IS_POINT_IN_TRIANGLE_2D_EXACT_BOOLEAN ____________________ **/


function is_point_in_triangle_2d_exact_boolean(node,point){


const point_x=point.x;
const point_z=point.z;


// СЧИТАЕМ ЗНАКОВЫЕ ПЛОЩАДИ ДЛЯ КАЖДОГО РЕБРА
const edge0=(point_x-node.ax)*node.abz-(point_z-node.az)*node.abx;
const edge1=(point_x-node.bx)*node.bcz-(point_z-node.bz)*node.bcx;
const edge2=(point_x-node.cx)*node.caz-(point_z-node.cz)*node.cax;


// ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ
return (edge0>=0 && edge1>=0 && edge2>=0);


}


/** ____________________ MOVE_ALONG_SURFACE ____________________ **/


function move_along_surface(agent,start_position,end_position,filter,allow_abyss_fall){


let start_node_id=agent.node_id;


const result=move_along_surface_result;
result.success=true;
result.node_id=start_node_id;
result.visited_length=0;


move_along_surface_search_id++;
const current_search_id=move_along_surface_search_id;


move_along_surface_pool_idx=0;
move_along_surface_queue.length=0;
let queue_head=0;


const start_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
start_node.node_id=start_node_id;
start_node.parent_node_id=null;


move_along_surface_search_nodes[start_node_id]=start_node;
move_along_surface_visited_flags[start_node_id]=current_search_id;


let current_best_x=start_position.x;
let current_best_y=start_position.y;
let current_best_z=start_position.z;


let previous_x=current_best_x;
let previous_y=current_best_y;
let previous_z=current_best_z;


let best_distance=Infinity;
let best_node=start_node;
let is_position_clamped_by_wall=false; // ФЛАГ ЗАЩИТЫ СТЕН


// РАСЧЁТ ЦЕНТРА. LERP 0.5
move_along_surface_search_position.x=start_position.x+(end_position.x-start_position.x)*0.5;
move_along_surface_search_position.y=start_position.y+(end_position.y-start_position.y)*0.5;
move_along_surface_search_position.z=start_position.z+(end_position.z-start_position.z)*0.5;


// ДИСТАНЦИЯ
const dx=end_position.x-start_position.x;
const dy=end_position.y-start_position.y;
const dz=end_position.z-start_position.z;
const search_radius_square=(Math.sqrt(dx*dx+dy*dy+dz*dz)/2.0+0.001)**2;


move_along_surface_queue.push(start_node);
const result_out=move_along_surface_distance_point_to_segment_squared_2d_result;


while(queue_head<move_along_surface_queue.length){


const current_node=move_along_surface_queue[queue_head++]; 
const mesh_node=nodes[current_node.node_id];


// КОНЕЧНАЯ ТОЧКА ВНУТРИ ТРЕУГОЛЬНИКА
if(is_point_in_triangle_2d_exact_boolean(mesh_node,end_position)){


best_node=current_node;
current_best_x=end_position.x; 
current_best_y=end_position.y; 
current_best_z=end_position.z;
// ЕСЛИ ДОЛЕТЕЛИ ДО ЦЕЛИ, СБРАСЫВАЕМ КЛЭМП СТЕНЫ
is_position_clamped_by_wall=false;
break;


}


// СОХРАНЯЕМ ПРЕДЫДУЩУЮ ПОЗИЦИЮ ДЛЯ ВЫЛЕТА
previous_x=current_best_x;
previous_y=current_best_y;
previous_z=current_best_z;


const ax=mesh_node.ax,ay=mesh_node.ay,az=mesh_node.az;
const bx=mesh_node.bx,by=mesh_node.by,bz=mesh_node.bz;
const cx=mesh_node.cx,cy=mesh_node.cy,cz=mesh_node.cz;


// РEБРО 1: СТОРОНА CA (neighbour_2)
let neighbour_id=mesh_node.neighbour_2;
let is_real_abyss_ca=(neighbour_id===-1 || mesh_node.ca_is_abyss);
let is_wall_ca=(is_real_abyss_ca && !allow_abyss_fall) || (!is_real_abyss_ca && ((filter && !filter.pass_filter(neighbour_id,nodes)) || move_along_surface_visited_flags[neighbour_id]===current_search_id));


// СТЕНА
if(is_wall_ca){
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,end_position,cx,cz,ax,az);
if(result_out.distance_square<best_distance){
// 1. ЗАЖИМАЕМ result_out.t С КРОШЕЧНЫМ ОТСТУПОМ ОТ КОНЦОВ РЕБРА (ЗАЩИТА ОТ ВЫЛЕТА ЧЕРЕЗ ВЕРШИНЫ)
const safe_t=Math.max(0.0001,Math.min(0.9999,result_out.t));
// 2. МИКРО-ОТСТУП ОТ СТЕНЫ: СДВИГАЕМ ТОЧКУ НА 0.0001 В СТОРОНУ ЦЕНТРА МАСС НОДЫ И ЧЕРЕЗ lerp СЧИТАЕМ ТОЧКУ СКОЛЬЖЕНИЯ НА СТЕНЕ
current_best_x=cx+safe_t*(ax-cx)+(mesh_node.centroid_x-(cx+safe_t*(ax-cx)))*0.0001;
current_best_y=cy+safe_t*(ay-cy);
current_best_z=cz+safe_t*(az-cz)+(mesh_node.centroid_z-(cz+safe_t*(az-cz)))*0.0001;
best_distance=result_out.distance_square;
best_node=current_node;
is_position_clamped_by_wall=true;
}
}
// ЛЕТИМ В ПРОПАСТЬ, ЕСЛИ РАЗРЕШЕНО 
else if(is_real_abyss_ca){
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,end_position,cx,cz,ax,az);
if(result_out.distance_square<best_distance){
best_distance=result_out.distance_square;
best_node=current_node;
}
}
// МОЖНО ИДТИ
else{
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,move_along_surface_search_position,cx,cz,ax,az);
if(result_out.distance_square<=search_radius_square){
const neighbour_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
neighbour_node.parent_node_id=current_node.node_id;
neighbour_node.node_id=neighbour_id;
move_along_surface_search_nodes[neighbour_id]=neighbour_node;
move_along_surface_visited_flags[neighbour_id]=current_search_id;
move_along_surface_queue.push(neighbour_node);
}
}


// РEБРО 2: СТОРОНА AB (neighbour_0)
neighbour_id=mesh_node.neighbour_0;
let is_real_abyss_ab=(neighbour_id===-1 || mesh_node.ab_is_abyss);
let is_wall_ab=(is_real_abyss_ab && !allow_abyss_fall) || (!is_real_abyss_ab && ((filter && !filter.pass_filter(neighbour_id,nodes)) || move_along_surface_visited_flags[neighbour_id]===current_search_id));


// СТЕНА
if(is_wall_ab){
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,end_position,ax,az,bx,bz);
if(result_out.distance_square<best_distance){
// 1. ЗАЖИМАЕМ result_out.t С КРОШЕЧНЫМ ОТСТУПОМ ОТ КОНЦОВ РЕБРА (ЗАЩИТА ОТ ВЫЛЕТА ЧЕРЕЗ ВЕРШИНЫ)
const safe_t=Math.max(0.0001,Math.min(0.9999,result_out.t));
// 2. МИКРО-ОТСТУП ОТ СТЕНЫ: СДВИГАЕМ ТОЧКУ НА 0.0001 В СТОРОНУ ЦЕНТРА МАСС НОДЫ И ЧЕРЕЗ lerp СЧИТАЕМ ТОЧКУ СКОЛЬЖЕНИЯ НА СТЕНЕ
current_best_x=ax+safe_t*(bx-ax)+(mesh_node.centroid_x-(ax+safe_t*(bx-ax)))*0.0001;
current_best_y=ay+safe_t*(by-ay);
current_best_z=az+safe_t*(bz-az)+(mesh_node.centroid_z-(az+safe_t*(bz-az)))*0.0001;
best_distance=result_out.distance_square;
best_node=current_node;
is_position_clamped_by_wall=true;
}
}
// ЛЕТИМ В ПРОПАСТЬ, ЕСЛИ РАЗРЕШЕНО 
else if(is_real_abyss_ab){
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,end_position,ax,az,bx,bz);
if(result_out.distance_square<best_distance){
best_distance=result_out.distance_square;
best_node=current_node;
}
}
// МОЖНО ИДТИ
else{
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,move_along_surface_search_position,ax,az,bx,bz);
if(result_out.distance_square<=search_radius_square){
const neighbour_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
neighbour_node.parent_node_id=current_node.node_id;
neighbour_node.node_id=neighbour_id;
move_along_surface_search_nodes[neighbour_id]=neighbour_node;
move_along_surface_visited_flags[neighbour_id]=current_search_id;
move_along_surface_queue.push(neighbour_node);
}
}


// РEБРО 3: СТОРОНА BC (neighbour_1)
neighbour_id=mesh_node.neighbour_1;
let is_real_abyss_bc=(neighbour_id===-1 || mesh_node.bc_is_abyss);
let is_wall_bc=(is_real_abyss_bc && !allow_abyss_fall) || (!is_real_abyss_bc && ((filter && !filter.pass_filter(neighbour_id,nodes)) || move_along_surface_visited_flags[neighbour_id]===current_search_id));


// СТЕНА
if(is_wall_bc){
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,end_position,bx,bz,cx,cz);
if(result_out.distance_square<best_distance){
// 1. ЗАЖИМАЕМ result_out.t С КРОШЕЧНЫМ ОТСТУПОМ ОТ КОНЦОВ РЕБРА (ЗАЩИТА ОТ ВЫЛЕТА ЧЕРЕЗ ВЕРШИНЫ)
const safe_t=Math.max(0.0001,Math.min(0.9999,result_out.t));
// 2. МИКРО-ОТСТУП ОТ СТЕНЫ: СДВИГАЕМ ТОЧКУ НА 0.0001 В СТОРОНУ ЦЕНТРА МАСС НОДЫ И ЧЕРЕЗ lerp СЧИТАЕМ ТОЧКУ СКОЛЬЖЕНИЯ НА СТЕНЕ
current_best_x=bx+safe_t*(cx-bx)+(mesh_node.centroid_x-(bx+safe_t*(cx-bx)))*0.0001;
current_best_y=by+safe_t*(cy-by);
current_best_z=bz+safe_t*(cz-bz)+(mesh_node.centroid_z-(bz+safe_t*(cz-bz)))*0.0001;
best_distance=result_out.distance_square;
best_node=current_node;
is_position_clamped_by_wall=true;
}
}
// ЛЕТИМ В ПРОПАСТЬ, ЕСЛИ РАЗРЕШЕНО 
else if(is_real_abyss_bc){
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,end_position,bx,bz,cx,cz);
if(result_out.distance_square<best_distance){
best_distance=result_out.distance_square;
best_node=current_node;
}
}
// МОЖНО ИДТИ
else{
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,move_along_surface_search_position,bx,bz,cx,cz);
if(result_out.distance_square<=search_radius_square){
const neighbour_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
neighbour_node.parent_node_id=current_node.node_id;
neighbour_node.node_id=neighbour_id;
move_along_surface_search_nodes[neighbour_id]=neighbour_node;
move_along_surface_visited_flags[neighbour_id]=current_search_id;
move_along_surface_queue.push(neighbour_node);
}
}


}


let current_node=best_node;
let count=0;


// ЗАПОЛНЯЕМ СРАЗУ В ПРАВИЛЬНОМ ХРОНОЛОГИЧЕСКОМ ПОРЯДКЕ БЕЗ .reverse()
// СНАЧАЛА СЧИТАЕМ ДЛИНУ ЦЕПОЧКИ
while(current_node){
count++;
current_node=current_node.parent_node_id!==null?(move_along_surface_search_nodes[current_node.parent_node_id] || null):null;
}


result.visited_length=count;
current_node=best_node;
let write_idx=count-1;
while(current_node){
result.visited[write_idx--]=current_node.node_id;
current_node=current_node.parent_node_id!==null?(move_along_surface_search_nodes[current_node.parent_node_id] || null):null;
}


result.node_id=best_node.node_id;


let node=nodes[result.node_id];


// ЗДЕСЬ is_position_clamped_by_wall СРАБАТЫВАЕТ ЕСЛИ ОТКЛЮЧЕН allow_abyss_fall
if(is_position_clamped_by_wall){


result.position.x=current_best_x;
result.position.y=current_best_y;
result.position.z=current_best_z;


}
else{


/**
ДЛЯ МИКРО-ШАГОВ В ПРОПАСТЬ:
ЕСЛИ ПОИСК ЗАВЕРШИЛСЯ, А current_best ОСТАЛСЯ РАВЕН СТАРТОВОЙ ПОЗИЦИИ,
НО ПРИ ЭТОМ ВКЛЮЧЕН allow_abyss_fall-ЭТО ЗНАЧИТ, ЧТО БОТ ДЕЛАЕТ ШАГ В ПУСТОТУ.
МЫ ПРИНУДИТЕЛЬНО ПРИСВАИВАЕМ current_best ЗНАЧЕНИЕ end_position, ЧТОБЫ ЗАФИКСИРОВАТЬ ДВИЖЕНИЕ НАРУЖУ.
**/


if(allow_abyss_fall && current_best_x===start_position.x && current_best_z===start_position.z){
current_best_x=end_position.x;
current_best_z=end_position.z;
}


// ИНИЦИАЛИЗИРУЕМ ПОЗИЦИЮ ЧИСТОЙ ТОЧКОЙ, ДО КОТОРОЙ ДОШЛИ
result.position.x=current_best_x;
result.position.z=current_best_z;
// ВРЕМЕННЫЙ ВЕКТОР ДЛЯ БЫСТРОЙ ПРОВЕРКИ
move_along_surface_search_position.x=current_best_x;
move_along_surface_search_position.z=current_best_z;


/**
ЧТОБЫ ИЗБЕЖАТЬ СЛУЧАЯ, КОГДА ТОЧКА СТОИТ НА СТЫКЕ ДВУХ ТРЕУГОЛЬНИКОВ (Т.Е. result.node_id ЕСТЬ, НО ПО ФАКТУ ТОЧКА ВНЕ ТРЕУГОЛЬНИКА !is_point_in_triangle_2d_exact_boolean),
ПРИНУДИТЕЛЬНО СМЕЩАЕМ ТОЧКУ К ЦЕНТРУ ТРЕУГОЛЬНИКА.
ВЫПОЛНЯЕТСЯ И ПРИ РАЗРЕШЕНИИ ИДТИ В ПРОПАСТЬ И ЗАПРЕТЕ. ПРИ РАЗРЕШЕНИИ ТОЖЕ НАДО СМЕЩАТЬ, Т.К. МОГ НЕ ДОБЕЖАТЬ ДО ПРОПАСТИ И ОСТАТЬСЯ НА СТЫКЕ
ЕСЛИ ВЫЛЕТЕЛ ЗА РЕБРО, ТО ТОЖЕ СМЕСТИТ НА 0.1ММ, Т.Е. 0.0001 МЕТР К ЦЕНТРУ И ЭТО НОРМАЛЬНО
**/


if(!is_point_in_triangle_2d_exact_boolean(node,move_along_surface_search_position)){
const dir_x=node.centroid_x-current_best_x;
const dir_z=node.centroid_z-current_best_z;
const length=Math.sqrt(dir_x*dir_x+dir_z*dir_z);
// ЧИСЛО 0.000001 АБСОЛЮТНО ВЕРНОЕ, МАТЕМАТИЧЕСКИ ОБОСНОВАННОЕ И ЯВЛЯЕТСЯ ИНДУСТРИАЛЬНЫМ СТАНДАРТОМ.
// ЕГО ЗАДАЧА-ЗАЩИТИТЬ ОТ ДЕЛЕНИЯ НА НОЛЬ ИЛИ ПОЛУЧЕНИЯ НЕВАЛИДНОГО ЗНАЧЕНИЯ Infinity.
if(length>0.000001){
// СМЕЩАЕМ ТОЧКУ РОВНО НА 0.1мм К ЦЕНТРУ ТРЕУГОЛЬНИКА
// 0.1мм ХВАТИТ НА КАРТУ РАЗМЕРОМ В СОТНИ КИЛОМЕТРОВ И МЕНЬШЕ НЕ НАДО
const push_factor=0.0001/length;
result.position.x+=dir_x*push_factor;
result.position.z+=dir_z*push_factor;
}
}
// ПЕРЕСЧИТЫВАЕМ Y
result.position.y=node.scaled_nx*result.position.x+node.scaled_nz*result.position.z+node.scaled_constant;


}


// ЕСЛИ НЕЛЬЗЯ ВЫХОДИТЬ ЗА РЕБРО, ТО ТОЧКА ВСЕГДА ВНУТРИ ТРЕУГОЛЬНИКА НАВИГАЦИИ
if(!allow_abyss_fall){
	
	
agent.node_id=result.node_id;
agent.position.x=result.position.x;
agent.position.y=result.position.y;
agent.position.z=result.position.z;
// ЕСЛИ ВЫСОТА get_detail_mesh_y НЕ БУДЕТ НАЙДЕНА (ИЗ-ЗА НЕПРАВИЛЬНЫХ ПАРАМЕТРОВ, ЗАПЕКАНИЯ), ТО ОСТАНЕТСЯ ВЫСОТА ОТ НАВИГАЦИИ
let get_detail_mesh_y_result=get_detail_mesh_y(agent);
if(get_detail_mesh_y_result!==false){
agent.position.y=get_detail_mesh_y_result;
}


}


// ЕСЛИ РАЗРЕШЕНО ВЫХОДИТЬ ЗА РЕБРО. СНОВА ПРОВЕРЯЕМ ТОЧНО ЛИ СОШЁЛ С ТРЕУГОЛЬНИКА
else{


let result_position=result.position;
let agent_position=agent.position;


if(is_point_in_triangle_2d_exact_boolean(node,result_position)===false){


//let edge_result=project_point_to_closest_abyss_edge(node,result_position);


// СБРАСЫВАЕМ ТЕКУЩИЙ node_id, Т.К. ПОД НОГАМИ НИЧЕГО НЕТ
agent.node_id=-1;


result_position.x=previous_x;
result_position.y=previous_y;
result_position.z=previous_z;



agent_position.x=previous_x;
agent_position.y=previous_y;
agent_position.z=previous_z;


// ВЫЧИСЛЯЕМ ОСТАТОК ПУТИ В МЕТРАХ ДЛЯ СЦЕНАРИЯ А
agent.air_wish_delta_x=current_best_x-previous_x;
agent.air_wish_delta_z=current_best_z-previous_z;


// СКОЛЬЗИМ ПО ПОВЕРХНОСТИ DETAIL MESH
let detail_y_start=previous_y;


// ЕСЛИ ВЫСОТА get_detail_mesh_y НЕ БУДЕТ НАЙДЕНА (ИЗ-ЗА НЕПРАВИЛЬНЫХ ПАРАМЕТРОВ, ЗАПЕКАНИЯ), ТО ОСТАНЕТСЯ ВЫСОТА ОТ НАВИГАЦИИ
let get_detail_mesh_y_result=get_detail_mesh_y(agent);


if(get_detail_mesh_y_result!==false){


agent_position.y=get_detail_mesh_y_result;
detail_y_start=get_detail_mesh_y_result;
let detail_mesh_node=detail_mesh_nodes[get_detail_mesh_y_result_data.node_id];
let nx=detail_mesh_node.scaled_nx;
let nz=detail_mesh_node.scaled_nz;
agent.slope_velocity_y=nx*agent.air_wish_delta_x+nz*agent.air_wish_delta_z;


// НАЧАЛЬНАЯ ВЕРТИКАЛЬНАЯ СКОРОСТЬ БАЛЛИСТИКИ СВОБОДНОГО ПОЛЕТА ДЛЯ СЦЕНАРИЯ Б (М/С)
// РАССЧИТЫВАЕТСЯ ПО ФОРМУЛЕ ПЛОСКОСТИ ДЕТАЛЬНОГО МЕША НА ПОЛНУЮ ДЛИНУ ШАГА
const total_mesh_step_x=current_best_x-start_position.x;
const total_mesh_step_z=current_best_z-start_position.z;
agent.velocity.y=nx*total_mesh_step_x+nz*total_mesh_step_z;
	

}
else{
// СКОЛЬЗИМ ПО ПОВЕРХНОСТИ NAVIGATION MESH, ЕСЛИ НЕ БУДЕТ НАЙДЕН DETAIL MESH
agent.slope_velocity_y=current_best_y-previous_y;
agent.velocity.y=current_best_y-start_position.y;	
}


result.success=false;


}
else{
	

agent.node_id=result.node_id;
agent_position.x=result_position.x;
agent_position.z=result_position.z;
agent_position.y=result_position.y;


// ЕСЛИ ВЫСОТА get_detail_mesh_y НЕ БУДЕТ НАЙДЕНА (ИЗ-ЗА НЕПРАВИЛЬНЫХ ПАРАМЕТРОВ, ЗАПЕКАНИЯ), ТО ОСТАНЕТСЯ ВЫСОТА ОТ НАВИГАЦИИ	
let get_detail_mesh_y_result=get_detail_mesh_y(agent);
if(get_detail_mesh_y_result!==false){
agent_position.y=get_detail_mesh_y_result;
}


}


}


return result;


}


/** ____________________ STEP_AGENT ____________________ **/


let step_agent_desired_position={x:0,y:0,z:0};
 

function step_agent(agent,delta_time){



step_agent_desired_position.x=agent.position.x+agent.velocity.x*delta_time;
step_agent_desired_position.y=agent.position.y;
step_agent_desired_position.z=agent.position.z+agent.velocity.z*delta_time;


/**
СОШЁЛ С НАВИГАЦИОННОЙ СЕТКИ
**/


if(agent.state===34){
	
	
agent.position.x=step_agent_desired_position.x;
agent.position.y=step_agent_desired_position.y-0.1;
agent.position.z=step_agent_desired_position.z;


let get_detail_mesh_y_result=get_detail_mesh_y(agent);
if(get_detail_mesh_y_result!==false){
agent.position.y=get_detail_mesh_y_result;
}


let position=agent.position;


let found_count=get_nodes_list_navigation_grid(position);


if(found_count>0){


let best_node_id=-1;
let min_distance_y=Infinity;
let best_floor_y=0;


for(let i=0;i<found_count;i++){


const node_id=navigation_grid_found_nodes[i];
const navigation_grid_node=nodes[node_id];


const test_y=is_point_in_triangle_2d_exact_y(navigation_grid_node,position);


if(test_y!==false){


const distance_y=Math.abs(position.y-test_y);


// ВЫБИРАЕМ БЛИЖАЙШИЙ ТРЕУГОЛЬНИК НАВИГАЦИОННОЙ СЕТКИ, Т.К. МЫ СТОИМ НА ПОВЕРХНОСТИ, А НЕ ВИСИМ В ВОЗДУХЕ
if(distance_y<min_distance_y){
min_distance_y=distance_y;
best_node_id=navigation_grid_node.id;
best_floor_y=test_y;
}


}


}


// ЕСЛИ НАШЛИ ПОЛ-ПРИЗЕМЛЯЕМ БОТА
if(best_node_id!==-1){


console.log("get_nodes_list_navigation_grid LAST node_id: "+agent.node_id+" NOW node_id: "+best_node_id);


agent.node_id=best_node_id;
agent.position.x=position.x;
agent.position.y=best_floor_y;
agent.position.z=position.z;
agent.state=1;


}


}







}


/**
ИДЁТ ПО НАВИГАЦИОННОЙ СЕТКЕ
**/


if(agent.state===1){


let result=move_along_surface(agent,agent.position,step_agent_desired_position,null,true);


if(result.success){


agent.state=1;


// КАКИЕ УЗЛЫ БЫЛИ ПРОЙДЕНЫ ПРИ ПЕРЕМЕЩЕНИИ, ВКЛЮЧАЯ НАЧАЛЬНЫЙ
/*
for(let i=0;i<moveResult.visited_length;i++){
let visited_node_id=moveResult.visited[i];
console.log(visited_node_id);
}
*/


}
else{
	
	
agent.state=2;


// ААА-РОКИРОВКА: ПОЛНОСТЬЮ ОТКЛЮЧАЕМ НАВИГАЦИЮ И ПЕРЕДАЕМ УПРАВЛЕНИЕ ФИЗИКЕ ПОЛЕТА КАПСУЛЫ
//agent.enable_capsule_physics_flight();


console.log("УЛЕТЕЛ");


}


}


}


/** ____________________ IS_POINT_IN_TRIANGLE_2D_EXACT_Y ____________________ **/


function is_point_in_triangle_2d_exact_y(node,point){


const point_x=point.x;
const point_z=point.z;


// СЧИТАЕМ ЧИСТЫЕ ЗНАКОВЫЕ ПЛОЩАДИ
const edge0=(point_x-node.ax)*node.abz-(point_z-node.az)*node.abx;
const edge1=(point_x-node.bx)*node.bcz-(point_z-node.bz)*node.bcx;
const edge2=(point_x-node.cx)*node.caz-(point_z-node.cz)*node.cax;


// ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ
if(edge0>=0 && edge1>=0 && edge2>=0){
/**
// ИМЕННО ЗДЕСЬ ОПРЕДЕЛЯЕМ ПЕРЕМЕННУЮ, А НЕ В ФОРМУЛЕ. ТАК РАБОТАЕТ БЫСТРЕЕ
const inv_ny=node.inv_ny;
// НАХОДИМ РЕАЛЬНОЕ ЗНАЧЕНИЕ Y В ТОЧКЕ XZ
return -(node.nx*point_x+node.nz*point_z+node.plane_constant)*inv_ny;
**/
// ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ УБРАНЫ, ТАК РАССЧИТАТЬ БЫСТРЕЕ
return node.scaled_nx*point_x+node.scaled_nz*point_z+node.scaled_constant;
}


return false;


}


/** ____________________ IS_POINT_IN_TRIANGLE_2D_MARGIN_DISTANCE_SQUARE ____________________ **/


let is_point_in_triangle_2d_margin_distance_square_result={closest_edge_index:-1,distance_square:0};


/**
ЗАЩИТА УГЛОВ КАРТЫ: ДВУХСТОРОННИЙ CLAMP-ЗАЖИМ T ПРИНУДИТЕЛЬНО СТЯГИВАЕТ МАТЕМАТИКУ К ФИЗИЧЕСКИМ ВЕРШИНАМ НА ОСТРЫХ УГЛАХ, ИСКЛЮЧАЯ НАСЛОЕНИЕ ТРЕУГОЛЬНИКОВ.
ИДЕАЛЬНЫЕ ШВЫ И СТЫКИ: ЭВРИСТИКА min_square_xz>0.00001 НИВЕЛИРУЕТ ДРЕБЕЗГ ЧИСЕЛ С ПЛАВАЮЩЕЙ ТОЧКОЙ В JS, СОХРАНЯЯ АСИММЕТРИЮ И СКОРОСТЬ РАННЕГО ВЫХОДА.
**/


/**
ПРОВЕРКА inv_len===0 УБРАНА, Т.К. ИЗНАЧАЛЬНО УБРАЛИ ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ ИЗ ГЕОМЕТРИИ ОБЪЕКТА
const inv_len=node.inv_ab_length_sq_xz; 
if(inv_len===0){
min_square_xz=dxa*dxa+dza*dza;
}else{
**/


function is_point_in_triangle_2d_margin_distance_square(node,point){


const point_x=point.x;
const point_z=point.z;


// 2. ОПТИМИЗАЦИЯ ВЕКТОРОВ: Вычисляем дельты ОДИН раз для площадей и для проекций
const dxa=point_x-node.ax; const dza=point_z-node.az;
const dxb=point_x-node.bx; const dzb=point_z-node.bz;
const dxc=point_x-node.cx; const dzc=point_z-node.cz;


// РАСЧЕТ ЗНАКОВЫХ ПЛОЩАДЕЙ (EDGE FUNCTION) С ИСПОЛЬЗОВАНИЕМ КЭШИРОВАННЫХ ВЕКТОРОВ
const edge0=dxa*node.abz-dza*node.abx;
const edge1=dxb*node.bcz-dzb*node.bcx;
const edge2=dxc*node.caz-dzc*node.cax;


let min_square_xz=Infinity;
let outside=false;
let best_edge=-1; // -1=ВНУТРИ ТРЕУГОЛЬНИКА


// РЕБРО 0: ОТРЕЗОК AB
if(edge0<0){
outside=true;
const inv_len=node.inv_ab_length_sq_xz; 
const abx=node.abx;
const abz=node.abz;
let t=(dxa*abx+dza*abz)*inv_len;
if(t<0){ t=0; }
else if(t>1){ t=1; }
const diff_x=dxa-t*abx; 
const diff_z=dza-t*abz;
min_square_xz=(diff_x*diff_x)+(diff_z*diff_z);
best_edge=0;
}


// РЕБРО 1: ОТРЕЗОК BC
if(edge1<0){
outside=true;
// ЗАЩИТА ШВА: УЧИТЫВАЕМ ДРЕБЕЗГ FLOAT В JS ЧЕРЕЗ ЭТОТ ПОРОГ
if(min_square_xz>0.0001){ 
const inv_len=node.inv_bc_length_sq_xz;
let dist_sq=0;
const bcx=node.bcx;
const bcz=node.bcz;
let t=(dxb*bcx+dzb*bcz)*inv_len;
if(t<0){ t=0; }
else if(t>1){ t=1; }
const diff_x=dxb-t*bcx; 
const diff_z=dzb-t*bcz;
dist_sq=(diff_x*diff_x)+(diff_z*diff_z);
if(dist_sq<min_square_xz){
min_square_xz=dist_sq;
best_edge=1;
}
}
}


// РЕБРО 2: ОТРЕЗОК CA
if(edge2<0){
outside=true;
// ЗАЩИТА ШВА: УЧИТЫВАЕМ ДРЕБЕЗГ FLOAT В JS ЧЕРЕЗ ЭТОТ ПОРОГ
if(min_square_xz>0.0001){ 
const inv_len=node.inv_ca_length_sq_xz;
let dist_sq=0;
const cax=node.cax;
const caz=node.caz;
let t=(dxc*cax+dzc*caz)*inv_len;
if(t<0){ t=0; }
else if(t>1){ t=1; }
const diff_x=dxc-t*cax; 
const diff_z=dzc-t*caz;
dist_sq=(diff_x*diff_x)+(diff_z*diff_z);
if(dist_sq<min_square_xz){
min_square_xz=dist_sq;
best_edge=2;
}
}
}


// ЗАЩИТА НА СЛУЧАЙ, ЕСЛИ ТОЧКА РЕАЛЬНО ВНУТРИ ТРЕУГОЛЬНИКА, НО ИЗ-ЗА ДРЕБЕЗГА FLOAT ПРЕДЫДУЩИЕ ФУНКЦИИ ЭТОГО НЕ ОБНАРУЖИЛИ
if(!outside){ 
min_square_xz=0; 
best_edge=-1; 
}


// ПРОВЕРЯЕМ ИТОГОВЫЙ МАРЖИН ТОЛЬКО ЕСЛИ ТОЧКА РЕАЛЬНО СНАРУЖИ
if(outside && min_square_xz>0.0001){ return false; }


is_point_in_triangle_2d_margin_distance_square_result.closest_edge_index=best_edge;
is_point_in_triangle_2d_margin_distance_square_result.distance_square=min_square_xz;


return true;


}


/** ____________________ CLAMP_POSITION_TO_EDGE_2D ____________________ **/


function clamp_position_to_edge_2d(position,edge_v1,edge_v2){


const dx=edge_v2.x-edge_v1.x;
const dz=edge_v2.z-edge_v1.z;
const length_square=dx*dx+dz*dz;


// ЕСЛИ РЕБРО МИКРОСКОПИЧЕСКОЕ, ЖЕСТКО СТАВИМ В edge_v1,
// ИНАЧЕ return БЕЗ ИЗМЕНЕНИЙ ОСТАВИТ БОТА ЗА ПРЕДЕЛАМИ ТРЕУГОЛЬНИКА
// НЕ МЕНЯТЬ 0.000001. ЭТО ИДЕАЛЬНОЕ ЗНАЧЕНИЕ ДЛЯ ИГРОВОЙ ГЕОМЕТРИИ
// НЕ УДАЛЯТЬ ЭТУ ПРОВЕРКУ. ОНА ЗАЩИЩАЕТ ОТ ОКРУГЛЕНИЙ, А НЕ ТОЛЬКО ОТ ВЫРОЖДЕННОГО ТРЕУГОЛЬНИКА
if(length_square<0.000001){
position.x=edge_v1.x;
position.z=edge_v1.z;
return;
}


const t=((position.x-edge_v1.x)*dx+(position.z-edge_v1.z)*dz)/length_square;
const clamped_t=Math.max(0.0,Math.min(1.0,t));


position.x=edge_v1.x+clamped_t*dx;
position.z=edge_v1.z+clamped_t*dz;


}


/** ____________________ GET_NODES_LIST_NAVIGATION_GRID ____________________ **/


function get_nodes_list_navigation_grid(position){


let point_y=position.y;


const x=Math.floor(position.x/navigation_grid_cells_size_xz);
const z=Math.floor(position.z/navigation_grid_cells_size_xz);


let start_y=Math.floor((point_y+navigation_detail_mesh_height)/navigation_grid_cells_size_y);
let end_y=Math.floor((point_y-navigation_detail_mesh_climb)/navigation_grid_cells_size_y);


let cell_base_key=(x+navigation_spatial_offset)*navigation_spatial_shift_x+(z+navigation_spatial_offset)*navigation_spatial_shift_z;


navigation_grid_search_id=(navigation_grid_search_id+1) & 0x7FFFFFFF;
if(navigation_grid_search_id===0){ navigation_grid_search_id=1; }


const current_search_id=navigation_grid_search_id;
navigation_grid_found_count=0;


for(let y=start_y;y>=end_y;y--){


const cell_key=cell_base_key+(y+navigation_spatial_offset);
let cell=navigation_grid_cells_array.get(cell_key);
   
   
if(cell==undefined){ continue; }


// ДОБАВЛЯЕМ ТОЛЬКО УНИКАЛЬНЫЕ ЗНАЧЕНИЯ
for(let k=0;k<cell.length;k++){


let node_id=cell[k];
if(navigation_grid_nodes_visited_flags[node_id]!==current_search_id){
navigation_grid_nodes_visited_flags[node_id]=current_search_id;
navigation_grid_found_nodes[navigation_grid_found_count++]=node_id;
}


}


}


return navigation_grid_found_count;


}


/** ____________________ GET_NODES_LIST_NAVIGATION_DETAIL_MESH ____________________ **/


function get_nodes_list_navigation_detail_mesh(position,top,bottom){


let point_y=position.y;


const x=Math.floor(position.x/navigation_detail_mesh_cells_size_xz);
const z=Math.floor(position.z/navigation_detail_mesh_cells_size_xz);


let start_y=Math.floor((point_y+top)/navigation_detail_mesh_cells_size_y);
let end_y=Math.floor((point_y-bottom)/navigation_detail_mesh_cells_size_y);


let cell_base_key=(x+navigation_spatial_offset)*navigation_spatial_shift_x+(z+navigation_spatial_offset)*navigation_spatial_shift_z;


navigation_detail_mesh_search_id=(navigation_detail_mesh_search_id+1) & 0x7FFFFFFF;
if(navigation_detail_mesh_search_id===0){ navigation_detail_mesh_search_id=1; }


const current_search_id=navigation_detail_mesh_search_id;
navigation_detail_mesh_found_count=0;


for(let y=start_y;y>=end_y;y--){


const cell_key=cell_base_key+(y+navigation_spatial_offset);
let cell=navigation_detail_mesh_cells_array.get(cell_key);
   
   
if(cell==undefined){ continue; }


// ДОБАВЛЯЕМ ТОЛЬКО УНИКАЛЬНЫЕ ЗНАЧЕНИЯ
for(let k=0;k<cell.length;k++){


let node_id=cell[k];
if(navigation_detail_mesh_nodes_visited_flags[node_id]!==current_search_id){
navigation_detail_mesh_nodes_visited_flags[node_id]=current_search_id;
navigation_detail_mesh_found_nodes[navigation_detail_mesh_found_count++]=node_id;
}


}


}


return navigation_detail_mesh_found_count;


}


/** ____________________ PROJECT_POINT_TO_CLOSEST_ABYSS_EDGE ____________________ **/


let project_point_to_closest_abyss_edge_result={x:0,z:0};


function project_point_to_closest_abyss_edge(node,point){


let px=point.x;
let pz=point.z;


let min_distance_square=Infinity;
let best_t=0.5;
let best_start_x=0;
let best_start_z=0;
let best_edge_x=0;
let best_edge_z=0;


// БЫСТРЫЙ ОПРОС 3 РЁБЕР ПО КВАДРАТАМ РАССТОЯНИЙ (AAA-Стандарт)


// РЕБРО 0 (AB)
{
const d_start_x=px-node.ax; const d_start_z=pz-node.az;
let t=(d_start_x*node.abx+d_start_z*node.abz)*node.inv_ab_length_sq_xz;
if(t<0.0001){ t=0.0001; } else if(t>0.9999){ t=0.9999; }
const proj_x=node.ax+t*node.abx; const proj_z=node.az+t*node.abz;
const dx=px-proj_x;
const dz=pz-proj_z;
const dist_sq=dx*dx+dz*dz;
if(dist_sq<min_distance_square){
min_distance_square=dist_sq;
best_t=t;
best_start_x=node.ax;
best_start_z=node.az;
best_edge_x=node.abx;
best_edge_z=node.abz;
}
}


// РЕБРО 1 (BC)
{
const d_start_x=px-node.bx; const d_start_z=pz-node.bz;
let t=(d_start_x*node.bcx+d_start_z*node.bcz)*node.inv_bc_length_sq_xz;
if(t<0.0001){ t=0.0001; } else if(t>0.9999){ t=0.9999; }
const proj_x=node.bx+t*node.bcx; const proj_z=node.bz+t*node.bcz;
const dx=px-proj_x;
const dz=pz-proj_z;
const dist_sq=dx*dx+dz*dz;
if(dist_sq<min_distance_square){
min_distance_square=dist_sq;
best_t=t;
best_start_x=node.bx;
best_start_z=node.bz;
best_edge_x=node.bcx;
best_edge_z=node.bcz;
}
}

// РЕБРО 2 (CA)
{
const d_start_x=px-node.cx; const d_start_z=pz-node.cz;
let t=(d_start_x*node.cax+d_start_z*node.caz)*node.inv_ca_length_sq_xz;
if(t<0.0001){ t=0.0001; } else if(t>0.9999){ t=0.9999; }
const proj_x=node.cx+t*node.cax; const proj_z=node.cz+t*node.caz;
const dx=px-proj_x;
const dz=pz-proj_z;
const dist_sq=dx*dx+dz*dz;
if(dist_sq<min_distance_square){
min_distance_square=dist_sq;
best_t=t;
best_start_x=node.cx;
best_start_z=node.cz;
best_edge_x=node.cax;
best_edge_z=node.caz;
}
}


// ЗАПИСЫВАЕМ РЕЗУЛЬТАТ
project_point_to_closest_abyss_edge_result.x=best_start_x+best_t*best_edge_x;
project_point_to_closest_abyss_edge_result.z=best_start_z+best_t*best_edge_z;


return project_point_to_closest_abyss_edge_result;


}


/** ____________________ STEPS_4 ____________________ **/


function steps_4(agent,node,position,allow_abyss_fall){


// СТУПЕНЬ 1: БЫСТРЫЙ ТЕСТ (СТРОГОЕ ПОПАДАНИЕ НА ТЕКУЩИЙ ТРЕУГОЛЬНИК)


let floor_y=is_point_in_triangle_2d_exact_y(node,position);


// ПРОВЕРЯЕМ НА !== false, ТАК КАК floor_y МОЖЕТ БЫТЬ РАВЕН 0.0
if(floor_y!==false){
agent.node_id=node.id;
agent.position.x=position.x;
agent.position.y=floor_y;
agent.position.z=position.z;
return true; 
}


// СТУПЕНЬ 2: БЫСТРЫЙ ТЕСТ СОСЕДЕЙ (ПЕРЕХОД НА СМЕЖНЫЙ ТРЕУГОЛЬНИК)


let neighbour_id_0=node.neighbour_0;


if(neighbour_id_0!==-1){
floor_y=is_point_in_triangle_2d_exact_y(nodes[neighbour_id_0],position);
if(floor_y!==false){
agent.node_id=neighbour_id_0;
agent.position.x=position.x;
agent.position.y=floor_y;
agent.position.z=position.z;
console.log("curexact_height_y_0 "+agent.node_id);
return true; 
}
}


let neighbour_id_1=node.neighbour_1;


if(neighbour_id_1!==-1){
floor_y=is_point_in_triangle_2d_exact_y(nodes[neighbour_id_1],position);
if(floor_y!==false){
agent.node_id=neighbour_id_1;
agent.position.x=position.x;
agent.position.y=floor_y;
agent.position.z=position.z;
console.log("curexact_height_y_1 "+agent.node_id);
return true; 
}
}


let neighbour_id_2=node.neighbour_2;


if(neighbour_id_2!==-1){
floor_y=is_point_in_triangle_2d_exact_y(nodes[neighbour_id_2],position);
if(floor_y!==false){
agent.node_id=neighbour_id_2;
agent.position.x=position.x;
agent.position.y=floor_y;
agent.position.z=position.z;
console.log("curexact_height_y_2 "+agent.node_id);
return true; 
}
}


// ЕСЛИ РАЗРЕШЕНО ПАДАТЬ-НЕ ПРИМАГНИЧИВАЕМ 
if(!allow_abyss_fall){


// СТУПЕНЬ 3: ТЕСТ С МАРЖИНОМ ДЛЯ СОСЕДЕЙ (ЗАЩИТА ШВОВ И МИКРО-ЗАЗОРОВ)


// ПЕРЕМЕННЫЕ ДЛЯ ПОИСКА ЛУЧШЕГО ТРЕУГОЛЬНИКА-СОСЕДА НА ШВАХ
let best_neighbour_id=-1;
let min_distance_square=Infinity;
let edge_v1=null;
let edge_v2=null;
const data=is_point_in_triangle_2d_margin_distance_square_result;


if(is_point_in_triangle_2d_margin_distance_square(node,position)){
min_distance_square=data.distance_square;
best_neighbour_id=node.id;
// ЕСЛИ closest_edge_index===-1, ЗНАЧИТ ТОЧКА ПОПАЛА В ДРЕБЕЗГ (НА САМОМ ДЕЛЕ ВНУТРИ)
// ЕСЛИ ВЕРНУЛСЯ ИНДЕКС 0, 1 ИЛИ 2 — БЕРЕМ ВЕРШИНЫ СООТВЕТСТВУЮЩЕЙ ГРАНИ ТЕКУЩЕЙ НОДЫ
const edge_idx=data.closest_edge_index;
if(edge_idx===0){ edge_v1=node.vertex_a; edge_v2=node.vertex_b; }
else if(edge_idx===1){ edge_v1=node.vertex_b; edge_v2=node.vertex_c; }
else if(edge_idx===2){ edge_v1=node.vertex_c; edge_v2=node.vertex_a; }
}


if(neighbour_id_0!==-1){
const n_node=nodes[neighbour_id_0];
if(is_point_in_triangle_2d_margin_distance_square(n_node,position)){
if(data.distance_square<min_distance_square){
min_distance_square=data.distance_square;
best_neighbour_id=neighbour_id_0;
// ЕСЛИ closest_edge_index===-1, ЗНАЧИТ ТОЧКА ПОПАЛА В ДРЕБЕЗГ (НА САМОМ ДЕЛЕ ВНУТРИ)
// ЕСЛИ ВЕРНУЛСЯ ИНДЕКС 0, 1 ИЛИ 2 — БЕРЕМ ВЕРШИНЫ СООТВЕТСТВУЮЩЕЙ ГРАНИ ТЕКУЩЕЙ НОДЫ
// СПЕРВА ЗАНУЛЯЕМ ССЫЛКИ ДЛЯ УЧЁТА closest_edge_index===-1
edge_v1=null; edge_v2=null;
const edge_idx=data.closest_edge_index;
if(edge_idx===0){ edge_v1=n_node.vertex_a; edge_v2=n_node.vertex_b; }
else if(edge_idx===1){ edge_v1=n_node.vertex_b; edge_v2=n_node.vertex_c; }
else if(edge_idx===2){ edge_v1=n_node.vertex_c; edge_v2=n_node.vertex_a; }
}
}
}


if(neighbour_id_1!==-1){
const n_node=nodes[neighbour_id_1];
if(is_point_in_triangle_2d_margin_distance_square(n_node,position)){
if(data.distance_square<min_distance_square){
min_distance_square=data.distance_square;
best_neighbour_id=neighbour_id_1;
// ЕСЛИ closest_edge_index===-1, ЗНАЧИТ ТОЧКА ПОПАЛА В ДРЕБЕЗГ (НА САМОМ ДЕЛЕ ВНУТРИ)
// ЕСЛИ ВЕРНУЛСЯ ИНДЕКС 0, 1 ИЛИ 2 — БЕРЕМ ВЕРШИНЫ СООТВЕТСТВУЮЩЕЙ ГРАНИ ТЕКУЩЕЙ НОДЫ
// СПЕРВА ЗАНУЛЯЕМ ССЫЛКИ ДЛЯ УЧЁТА closest_edge_index===-1
edge_v1=null; edge_v2=null;
const edge_idx=data.closest_edge_index;
if(edge_idx===0){ edge_v1=n_node.vertex_a; edge_v2=n_node.vertex_b; }
else if(edge_idx===1){ edge_v1=n_node.vertex_b; edge_v2=n_node.vertex_c; }
else if(edge_idx===2){ edge_v1=n_node.vertex_c; edge_v2=n_node.vertex_a; }
}
}
}


if(neighbour_id_2!==-1){
const n_node=nodes[neighbour_id_2];
if(is_point_in_triangle_2d_margin_distance_square(n_node,position)){
if(data.distance_square<min_distance_square){
min_distance_square=data.distance_square;
best_neighbour_id=neighbour_id_2;
// ЕСЛИ closest_edge_index===-1, ЗНАЧИТ ТОЧКА ПОПАЛА В ДРЕБЕЗГ (НА САМОМ ДЕЛЕ ВНУТРИ)
// ЕСЛИ ВЕРНУЛСЯ ИНДЕКС 0, 1 ИЛИ 2 — БЕРЕМ ВЕРШИНЫ СООТВЕТСТВУЮЩЕЙ ГРАНИ ТЕКУЩЕЙ НОДЫ
// СПЕРВА ЗАНУЛЯЕМ ССЫЛКИ ДЛЯ УЧЁТА closest_edge_index===-1
edge_v1=null; edge_v2=null;
const edge_idx=data.closest_edge_index;
if(edge_idx===0){ edge_v1=n_node.vertex_a; edge_v2=n_node.vertex_b; }
else if(edge_idx===1){ edge_v1=n_node.vertex_b; edge_v2=n_node.vertex_c; }
else if(edge_idx===2){ edge_v1=n_node.vertex_c; edge_v2=n_node.vertex_a; }
}
}
}


if(best_neighbour_id!==-1){


console.log("3d_margin "+agent.node_id);


agent.node_id=best_neighbour_id;
const best_node=nodes[best_neighbour_id];
// ПРИМАГНИЧИВАЕМ, ЕСЛИ ТОЧКА ВЫЛЕТЕЛА ЗА РЕБРО
if(edge_v1 && edge_v2){
clamp_position_to_edge_2d(position,edge_v1,edge_v2);
}
// СМЕЩАЕМ ТОЧКУ К ЦЕНТРУ, ЕСЛИ ИЗ-ЗА МАТЕМАТИЧЕСКОГО ДРЕБЕЗГА, ТОЧКУ МОЖНО СЧИТАТЬ ВНУТРИ (closest_edge_index===-1) 
// ИСПОЛЬЗУЕМ ИМЕННО ПРОЦЕНТ 0.0001, А НЕ 0.1ММ
else{
position.x+=(best_node.centroid_x-position.x)*0.0001;
position.z+=(best_node.centroid_z-position.z)*0.0001;
}
agent.position.x=position.x;
/**
// ИМЕННО ЗДЕСЬ ОПРЕДЕЛЯЕМ ПЕРЕМЕННУЮ, А НЕ В ФОРМУЛЕ. ТАК РАБОТАЕТ БЫСТРЕЕ
const inv_ny=best_node.inv_ny;
// НАХОДИМ РЕАЛЬНОЕ ЗНАЧЕНИЕ Y В ТОЧКЕ XZ
agent.position.y=-(best_node.nx*position.x+best_node.nz*position.z+best_node.plane_constant)*inv_ny;
**/
// ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ УБРАНЫ, ТАК РАССЧИТАТЬ БЫСТРЕЕ
agent.position.y=best_node.scaled_nx*position.x+best_node.scaled_nz*position.z+best_node.scaled_constant;
agent.position.z=position.z;
return true;


}


}


// СТУПЕНЬ 4: СПАСЕНИЕ ЧЕРЕЗ GRID


let found_count=get_nodes_list_navigation_grid(position);


if(found_count>0){


let best_node_id=-1;
let min_difference_y=Infinity;
let best_floor_y=0;


for(let i=0;i<found_count;i++){


const node_id=navigation_grid_found_nodes[i];
const navigation_grid_node=nodes[node_id];


const test_y=is_point_in_triangle_2d_exact_y(navigation_grid_node,position);


if(test_y!==false){


const difference_y=position.y-test_y;


// СТРОГИЙ AAA-ФИЛЬТР ЯРУСОВ: ТРЕУГОЛЬНИК ОБЯЗАН БЫТЬ ПОД НОГАМИ (difference_y>=0)
if(difference_y>=0 && difference_y<min_difference_y){
min_difference_y=difference_y;
best_node_id=navigation_grid_node.id;
best_floor_y=test_y;
}


}


}


// ЕСЛИ НАШЛИ ПОЛ-ПРИЗЕМЛЯЕМ БОТА
if(best_node_id!==-1){


console.log("get_nodes_list_navigation_grid "+agent.node_id);


agent.node_id=best_node_id;
agent.position.x=position.x;
agent.position.y=best_floor_y;
agent.position.z=position.z;
return true;


}


}


return false;


}


/** ____________________ GET_DETAIL_MESH_Y ____________________ **/


let get_detail_mesh_y_result_data={y:0,node_id:-1};


function get_detail_mesh_y(agent){


/**
ЕСТЬ ОДИН КОВАРНЫЙ МАТЕМАТИЧЕСКИЙ БАГ В ФУНКЦИИ EXACT (ТОЧНАЯ ПРОВЕРКА НАХОЖДЕНИЯ ТОЧКИ В ТРЕУГОЛЬНИКЕ), НА КОТОРЫЙ ЧАСТО НАСТУПАЮТ ПРИ РАЗРАБОТКЕ НАВИГАЦИИ,
И СВЯЗАН ОН ИМЕННО С ПОВЕДЕНИЕМ ТОЧКИ НА ГРАНИЦАХ, РЁБРАХ И В САМЫХ УГЛАХ ТРЕУГОЛЬНИКОВ.
КОГДА МЫ ПРОВЕРЯЕМ, НАХОДИТСЯ ЛИ ТОЧКА ВНУТРИ ТРЕУГОЛЬНИКА ЧЕРЕЗ БАРИЦЕНТРИЧЕСКИЕ КООРДИНАТЫ (U, V, W), МАТЕМАТИКА В ТЕОРИИ ИДЕАЛЬНА.
ЕСЛИ БОТ СТОИТ СТРОГО НА РЕБРЕ, ОДНА ИЗ КООРДИНАТ ДОЛЖНА БЫТЬ РАВНА 0. ЕСЛИ ОН СТОИТ ТОЧНО В УГЛУ (В ВЕРШИНЕ), ТО ДВЕ КООРДИНАТЫ СТАНОВЯТСЯ РАВНЫ 0, А ТРЕТЬЯ-1.
НО НА ПРАКТИКЕ В ДВИЖКЕ JS ВСЕ РАСЧЕТЫ ИДУТ ЧЕРЕЗ АППАРАТНЫЙ ТИП FLOAT64 (ЧИСЛА С ПЛАВАЮЩЕЙ ЗАПЯТОЙ). И У ПРОЦЕССОРА НА УРОВНЕ АССЕМБЛЕРА ЕСТЬ МИКРОСКОПИЧЕСКАЯ ПОГРЕШНОСТЬ ОКРУГЛЕНИЯ.
ИЗ-ЗА ЭТОЙ ПОГРЕШНОСТИ, КОГДА БОТ ВСТАЕТ ИДЕАЛЬНО В УГОЛ ТРЕУГОЛЬНИКА, ПРОЦЕССОР ВМЕСТО ЧИСТОГО НУЛЯ ВЫДАЕТ, НАПРИМЕР, -0.0000000000000001 (МИНУС В ПЯТНАДЦАТОМ ЗНАКЕ ПОСЛЕ ЗАПЯТОЙ).
И ТУТ ЗАХЛОПЫВАЕТСЯ КАПКАН ФУНКЦИИ EXACT:
1. ЕСЛИ В КОДЕ СТОИТ ЖЕСТКАЯ, "ЧЕСТНАЯ" ПРОВЕРКА ЗНАКА: if(U >= 0 && V >= 0 && U+V <= 1), ТО ИЗ-ЗА ЭТОГО НИЧТОЖНОГО, ФАНТОМНОГО МИНУСА В УГЛУ УСЛОВИЕ МГНОВЕННО ВОЗВРАЩАЕТ FALSE.
2. АЛГОРИТМ ПАНИКУЕТ И СЧИТАЕТ: "ТОЧКА НАХОДИТСЯ СНАРУЖИ ТРЕУГОЛЬНИКА".
3. ФУНКЦИЯ GET_DETAIL_MESH_Y ОТБРАКОВЫВАЕТ ЭТОТ ТРЕУГОЛЬНИК. А ТАК КАК БОТ СТОИТ НА СТЫКЕ, СОСЕДНИЙ ТРЕУГОЛЬНИК ИЗ-ЗА ТОЙ ЖЕ ПОГРЕШНОСТИ ТОЖЕ МОЖЕТ ВЕРНУТЬ МИКРО-МИНУС.
В ИТОГЕ ПОЛУЧАЕТСЯ БАГ: БОТ ВИЗУАЛЬНО СТОИТ НА ИДЕАЛЬНОМ, РОВНОМ МЕШЕ, НО ПОПАВ В УГОЛ ИЛИ НА РЕБРО, ОН НА ОДИН КАДР "ТЕРЯЕТ" ПОД СОБОЙ ЗЕМЛЮ. СИСТЕМА СЧИТАЕТ, ЧТО ОН В ПУСТОТЕ, И ФУНКЦИЯ ВОЗВРАЩАЕТ МАРКЕР ОШИБКИ (-9999999). В ЭТОТ МОМЕНТ БОТА МОЖЕТ ЖЕСТКО ДЕРНУТЬ, ОН МОЖЕТ ЗАСТРЯТЬ, ЗАЦИКЛИТЬСЯ ИЛИ НАЧАТЬ ЛЕВИТИРОВАТЬ НАД ФАНТОМНОЙ ПЛОСКОСТЬЮ.
ИМЕННО ПОЭТОМУ НЕЛЬЗЯ ПОЛАГАТЬСЯ НА ЧИСТЫЙ if(U >= 0). ЧТОБЫ УГЛЫ И СТЫКИ ПОЛИГОНОВ НЕ ДРОЖАЛИ, НУЖНО ЛИБО ЗАКЛАДЫВАТЬ МИКРОСКОПИЧЕСКИЙ ПОРОГ ПОГРЕШНОСТИ (ЭПСИЛОН, НАПРИМЕР U >= -0.00001), ЛИБО ДЕЛАТЬ СПЕЦИАЛЬНЫЙ РЕЗОЛВЕР МИКРО-ШВОВ ЧЕРЕЗ БЛОК ELSE (КАК СДЕЛАННО СЕЙЧАС), КОТОРЫЙ ПОСЧИТАЕТ МОДУЛЬ ЭТОЙ ОШИБКИ И, ЕСЛИ ЭТОТ МИНУС НИЧТОЖНО МАЛ, НАСИЛЬНО ВЕРНЕТ БОТА НА ЗАКОННОЕ МЕСТО».
ЕЩЁ МОЖЕТ ПОСЧИТАТЬ ЧТО ТОЧКА ВНУТРИ ТРЕУГОЛЬНИКА ИЗ-ЗА ПОГРЕШНОСТИ, НАПРИМЕР, +0.00000000001, И ЕСЛИ ПОТОМ ЗАПУСТИТЬ ФУНКЦИЮ ПРОВЕРКИ ТОЧНОГО НАХОЖДЕНИЯ ТОЧКА ВНУТРИ ТРЕУГОЛЬНИКА (EXACT), ОНА НЕ НАЙДЁТ ЕГО.
НО ЭТО НОРМАЛЬНО, ЗДЕСЬ МЫ ИЩЕМ ТОЛЬКО ВЫСОТУ.
**/


let agent_position=agent.position;


let found_count=get_nodes_list_navigation_detail_mesh(agent_position,navigation_detail_mesh_height,navigation_detail_mesh_climb);


let px=agent_position.x;
let py=agent_position.y;
let pz=agent_position.z;


let best_exact_node_id=-1;
let best_closest_node_id=-1;


// ПЕРЕМЕННЫЕ ЭТАПА 1 (ТОЧНОЕ БАРИЦЕНТРИЧЕСКОЕ ПОПАДАНИЕ)
let best_height=-Infinity;


// ПЕРЕМЕННЫЕ ЭТАПА 2 (СПАСИТЕЛЬНЫЕ МИКРО-ШВЫ НА СТЫКАХ КРАЕВ)
let closest_height=-Infinity;
let min_closest_delta_y=Infinity;
let min_error=Infinity;
  

for(let i=0;i<found_count;i++){


let node=detail_mesh_nodes[navigation_detail_mesh_found_nodes[i]];


/**
ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ УБРАНЫ, А ЗНАЧИТ ПРОВЕРКА НЕ НУЖНА
if(node.inv_denom===0){ continue; }
**/


// 1. ДИНАМИЧЕСКИЙ ВЕКТОР ДО ТОЧКИ БОТА В XZ
let v2x=px-node.ax; 
let v2z=pz-node.az;


// 2. СКАЛЯРНЫЕ ПРОИЗВЕДЕНИЯ С ТОЧКОЙ (РЁБРА AB И AC)
let dot02=node.abx*v2x+node.abz*v2z;
let dot12=node.acx*v2x+node.acz*v2z;


// 3. ВЫЧИСЛЯЕМ ЧИСТЫЕ БАРИЦЕНТРИЧЕСКИЕ ЧИСЛИТЕЛИ ДЛЯ U И V
let u_num=node.dot11*dot02-node.dot01*dot12;
let v_num=node.dot00*dot12-node.dot01*dot02;


// 4. МГНОВЕННО РАССЧИТЫВАЕМ ВЫСОТУ ПЛОСКОСТИ ДАННОГО ТРЕУГОЛЬНИКА
let test_y=node.scaled_nx*px+node.scaled_nz*pz+node.scaled_constant;
let delta_y=py-test_y;


// ЧЕСТНЫЙ ФИЛЬТР ЭТАЖА (AAA-СТАНДАРТ): 
// ПОВЕРХНОСТЬ МОЖЕТ БЫТЬ НИЖЕ НАВИГАЦИОННОЙ СЕТКИ delta_y<navigation_detail_mesh_climb
// И ВЫШЕ НЕЁ delta_y>-navigation_detail_mesh_height


if(delta_y>-navigation_detail_mesh_height && delta_y<navigation_detail_mesh_climb){


// ЭТАП 1: ТОЧНОЕ БАРИЦЕНТРИЧЕСКОЕ ПОПАДАНИЕ ПО XZ (99.9% КАДРОВ ХОДЬБЫ)
if(u_num>=0 && v_num>=0 && (u_num+v_num)<=node.denom){


// ИЩЕМ САМЫЙ ВЕРХНИЙ ПОЛ
if(test_y>best_height){
best_height=test_y;
best_exact_node_id=node.id;
}


}


// ЭТАП 2: РАСЧЁТ МИКРО-ШВОВ (ВКЛЮЧАЕТСЯ ТОЛЬКО ПРИ ПЛАНАРНОМ ПРОМАХЕ)
else{ 


let num_error=(u_num<0?-u_num:0)+(v_num<0?-v_num:0);


// Вычисление w_num опущено сюда, разгружая основной путь ходьбы
let w_num=node.denom-u_num-v_num;
if(w_num<0){ num_error-=w_num; }


let current_error=num_error*node.inv_denom;


/**
current_error ЭТО ПОРОГ В ВИДЕ ПРОЦЕНТА ОТ РАЗМЕРА ТРЕУГОЛЬНИКА. ОН ПОЗВОЛЯЕТ СЧИТАТЬ ВЫХОД ЗА ПРЕДЕЛЫ ПОРОГА ПРОПАСТЬЮ.
ТО ЕСТЬ ЕСЛИ ПОРОГ НЕ ДОСТИГНУТ ТО, ЕСЛИ ТОЧКА СТОИТ ЗА ТРЕУГОЛЬНИКОМ НА ПАРУ САНТИМЕТРОВ, ТО СЧИТАЕТСЯ, ЧТО ПОД ТОЧКОЙ НЕТ ПРОПАСТИ.
ЭТО УДОБНО ЕСЛИ В ПОЛУ НЕБОЛЬШАЯ ДЫРА И НЕ НАДО ТУДА ПРОВАЛИВАТЬСЯ.
НО ТАК КАК АГЕНТ ДВИЖЕТСЯ ПО Navigation Mesh ГДЕ НЕТ ДЫР, Т.Е. ПРОВАЛИСЯ НЕ ДОЛЖЕН, ТО ОТКЛЮЧАЕМ ЭТУ ПРОВЕРКУ.
ДЛЯ ТРЕУГОЛЬНИКА РАЗМЕРОМ 100 МЕТРОВ 0.01% ПОРОГА БУДЕТ 1 САНТИМЕТР. 
ЭТА ПРОВЕРКА МОЖЕТ НЕ СРАБОТАТЬ, ЕСЛИ НАД ЭТОЙ ДЫРОЙ НЕТ ЯЧЕЙКИ ИЗ get_nodes_list_navigation_detail_mesh.
**/
//if(current_error>0.01) { continue; }


/**
ЧЕСТНАЯ ИЗОЛИРОВАННАЯ ИЕРАРХИЯ НА ШВАХ ХОЛМИСТЫХ МНОГОЯРУСНЫХ КАРТ:
НОВЫЙ ТРЕУГОЛЬНИК ШВА ПОБЕЖДАЕТ, ЕСЛИ ОН СУЩЕСТВЕННО ВЫШЕ/БЛИЖЕ К НОГАМ (delta_y<min_closest_delta_y-0.15)
0.15 ЭТО AAA-СТАНДАРТ "ТОЛЩИНЫ ПЕРЕКРЫТИЯ" ДЛЯ НАВИГАЦИОННЫХ СИСТЕМ
ПОРОГ 0.15 ЗАВЯЗАН НА ВЫСОТУ СТАНДАРТНОЙ АРХИТЕКТУРНОЙ СТУПЕНЬКИ. ЕСЛИ ОНА МЕНЬШЕ, ТО СТАВИТЬ МЕНЬШЕ.
**/


// AAA-СТАНДАРТ: ПЕРЕВОДИМ ДЕЛЬТЫ В АБСОЛЮТНОЕ РАССТОЯНИЕ ДО НОГ БОТА (Math.abs),
// ЧТОБЫ ОТРИЦАТЕЛЬНЫЕ ДЕЛЬТЫ (УСТУПЫ ВЫШЕ НОГ) НЕ СДВИГАЛИ ОКНО ПОИСКА В ХАОС.
let abs_delta=Math.abs(delta_y);
let best_abs_delta=Math.abs(min_closest_delta_y);


// 1. НОВЫЙ ШОВ КАРДИНАЛЬНО БЛИЖЕ К ПОДОШВЕ БОТА ПО ВЕРТИКАЛИ (СМЕНА ЯРУСА БЛИЖЕ К НОГАМ)
let is_closer_floor=(abs_delta<best_abs_delta-0.15);


// 2. ТРЕУГОЛЬНИКИ ЛЕЖАТ В РАМКАХ ОДНОГО ЯРУСА (В ПРЕДЕЛАХ СТУПЕНИ 15 СМ), 
// НО У НОВОГО ТРЕУГОЛЬНИКА ПЛАНАРНАЯ ОШИБКА ВЫЛЕТА (current_error) МЕНЬШЕ!
let is_same_floor_but_less_error=(Math.abs(abs_delta-best_abs_delta)<=0.15 && current_error<min_error);


if(is_closer_floor || is_same_floor_but_less_error){
min_error=current_error;
min_closest_delta_y=delta_y;
closest_height=test_y;
best_closest_node_id=node.id;
} 


}
}
}


// ВЫДАЕМ РЕЗУЛЬТАТ: ТОЧНЫЙ МАТЧ ВСЕГДА В АБСОЛЮТНОМ ПРИОРИТЕТЕ ВО ВСЕМ МАССИВЕ
if(best_height!==-Infinity){
get_detail_mesh_y_result_data.y=best_height;
get_detail_mesh_y_result_data.node_id=best_exact_node_id;
return best_height+get_detail_mesh_y_offset;
}
// ЕСЛИ ТОЧНОГО ПЛАНАРНОГО ПОПАДАНИЯ ВО ВСЕМ МАССИВЕ НЕ НАШЛОСЬ, ВОЗВРАЩАЕМ СПАСЕННЫЙ ШОВ НАШЕГО ЭТАЖА
if(closest_height!==-Infinity){
get_detail_mesh_y_result_data.y=closest_height;
get_detail_mesh_y_result_data.node_id=best_closest_node_id;
return closest_height+get_detail_mesh_y_offset;
}


// ПОД НОГАМИ НИЧЕГО НЕ НАЙДЕНО НА ТАКОЙ ДИСТАНЦИИ
return false;


}


/** ____________________ IS_GROUNDED ____________________ **/


function is_grounded(agent){


let agent_position=agent.position;


let found_count=get_nodes_list_navigation_detail_mesh(agent_position,navigation_detail_mesh_height,navigation_detail_mesh_climb);


if(found_count>0){


let best_node_id=-1;
let min_difference_y=Infinity;
let best_floor_y=0;


for(let i=0;i<found_count;i++){


let node_id=navigation_detail_mesh_found_nodes[i];
let node=detail_mesh_nodes[node_id];


let test_y=is_point_in_triangle_2d_exact_y(node,agent_position);


if(test_y!==false){


let difference_y=agent_position.y-test_y;


if(difference_y>=0 && difference_y<min_difference_y){
min_difference_y=difference_y;
best_node_id=node_id;
best_floor_y=test_y;
}


}


}


if(best_node_id!==-1){

/*
console.log("get_nodes_list_navigation_detail_mesh "+agent.node_id);


agent.node_id=best_node_id;
agent.position.x=position.x;
agent.position.y=best_floor_y;
agent.position.z=position.z;
*/
return best_floor_y;


}


}


return false;


}


/** ____________________ SET_TARGET_DIRECTION ____________________ **/


function set_target_direction(agent){


let object=agent.object;


let point=agent.path[agent.next_path_point];
let object_quaternion=object.quaternion;


let quaternion_x=object_quaternion._x;
let quaternion_y=object_quaternion._y;
let quaternion_z=object_quaternion._z;
let quaternion_w=object_quaternion._w;


object.lookAt(point.x,object.position.y,point.z);


let agent_quaternion=agent.quaternion;
agent_quaternion._x=object.quaternion._x;
agent_quaternion._y=object.quaternion._y;
agent_quaternion._z=object.quaternion._z;
agent_quaternion._w=object.quaternion._w;


object_quaternion._x=quaternion_x;
object_quaternion._y=quaternion_y;
object_quaternion._z=quaternion_z;
object_quaternion._w=quaternion_w;


}


/** ____________________ CROWD ____________________ **/


class crowd{


constructor(data,crowd_debug){


this.app=data;
let app=data;
this.pathfinder=app.pathfinder;


this.crowd_debug=crowd_debug;
this.helpers_created=false;
if(crowd_debug){ this.helpers_turn_on(); }


this.agents=agents;


this.get_detail_mesh_y=get_detail_mesh_y;


}


/** ____________________ HELPERS_TURN_ON ____________________ **/


helpers_turn_on(){


this.crowd_debug=true;
if(!this.helpers_created){
this.helpers_created=true;
this.helpers_create();
}
this.mesh_crowd_helpers.visible=true;


}


/** ____________________ HELPERS_TURN_OFF ____________________ **/


helpers_turn_off(){


this.crowd_debug=false;
this.mesh_crowd_helpers.visible=false;


}


/** ____________________ HELPERS_CREATE ____________________ **/


helpers_create(){


this.mesh_crowd_helpers=new THREE.Group();
this.app.scene.add(this.mesh_crowd_helpers);


// 10000 ЗАЙМЁТ 1.25МБ ПАМЯТИ
this.mesh_agents_body=new THREE.InstancedMesh(new THREE.CapsuleGeometry(1.0,5.0,6,12).translate(0,3.5,0),new THREE.MeshLambertMaterial({color:0xff0000}),10000);
this.mesh_agents_body.count=0;
this.mesh_agents_body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
this.mesh_agents_body.frustumCulled=false;
this.mesh_agents_body.matrixAutoUpdate=false;
this.mesh_agents_body.updateMatrixWorld=function(){};
this.mesh_crowd_helpers.add(this.mesh_agents_body);


let arrow_offset_y=0.02;
const arrow_vertices=new Float32Array([
0.0,arrow_offset_y,1.0,
-0.1,arrow_offset_y,0.8,
0.1,arrow_offset_y,0.8,
-0.01,arrow_offset_y,0.8,
0.01,arrow_offset_y,0.8, 
-0.01,arrow_offset_y,0.0,
0.01,arrow_offset_y,0.0
]);
const arrow_indices=[
0,1,2,
3,5,4,
4,5,6
];


let arrow_geometry=new THREE.BufferGeometry();
arrow_geometry.setAttribute("position",new THREE.BufferAttribute(arrow_vertices,3));
arrow_geometry.setIndex(arrow_indices);
arrow_geometry.computeVertexNormals();


// 10000 ЗАЙМЁТ 0.001МБ ПАМЯТИ
this.mesh_agents_arrow=new THREE.InstancedMesh(arrow_geometry,new THREE.MeshBasicMaterial({color:0xffff00,side:THREE.DoubleSide}),10000);
this.mesh_agents_arrow.count=0;
this.mesh_agents_arrow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
this.mesh_agents_arrow.frustumCulled=false;
this.mesh_agents_arrow.matrixAutoUpdate=false;
this.mesh_agents_arrow.updateMatrixWorld=function(){};
this.mesh_crowd_helpers.add(this.mesh_agents_arrow);


this.mesh_agents_path_lines=new THREE.LineSegments(
// У КАЖДОЙ ЛИНИИ 2 ВЕРШИНЫ (НАЧАЛО И КОНЕЦ), ПОЭТОМУ УМНОЖАЕМ ЕЩЁ НА 2
// 100000*3*2 ЗАЙМЁТ 4.6МБ ПАМЯТИ
new THREE.BufferGeometry().setAttribute("position",new THREE.BufferAttribute(new Float32Array(100000*3*2),3).setUsage(THREE.DynamicDrawUsage)),
new THREE.LineBasicMaterial({color:0xff0000})
);
this.mesh_agents_path_lines.geometry.setDrawRange(0,0);
this.mesh_agents_path_lines.position.y=0.03;
this.mesh_agents_path_lines.frustumCulled=false;
this.mesh_agents_path_lines.updateMatrixWorld();
this.mesh_agents_path_lines.matrixAutoUpdate=false;
this.mesh_agents_path_lines.updateMatrixWorld=function(){};
this.mesh_crowd_helpers.add(this.mesh_agents_path_lines);


// 100000 ЗАЙМЁТ 12.5МБ ПАМЯТИ
this.mesh_agents_path_points=new THREE.InstancedMesh(new THREE.BoxGeometry(0.03,0.03,0.03),new THREE.MeshBasicMaterial({color:0x0000ff}),100000);
this.mesh_agents_path_points.count=0;
this.mesh_agents_path_points.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
this.mesh_agents_path_lines.add(this.mesh_agents_path_points);
this.mesh_agents_path_points.frustumCulled=false;
this.mesh_agents_path_points.updateMatrixWorld();
this.mesh_agents_path_points.matrixAutoUpdate=false;
this.mesh_agents_path_points.updateMatrixWorld=function(){};


// 10000 ЗАЙМЁТ 1.25МБ ПАМЯТИ
this.mesh_agents_path_next_point=new THREE.InstancedMesh(new THREE.BoxGeometry(0.02,0.4,0.02).translate(0,0.2,0),new THREE.MeshBasicMaterial({color:0x00ff00}),10000);
this.mesh_agents_path_next_point.count=0;
this.mesh_agents_path_next_point.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
this.mesh_agents_path_next_point.frustumCulled=false;
this.mesh_agents_path_next_point.matrixAutoUpdate=false;
this.mesh_agents_path_next_point.updateMatrixWorld=function(){};
this.mesh_crowd_helpers.add(this.mesh_agents_path_next_point);


// 10000 ЗАЙМЁТ 1.25МБ ПАМЯТИ
this.mesh_agents_clamp_step=new THREE.InstancedMesh(new THREE.BoxGeometry(0.04,0.4,0.04).translate(0,0.2,0),new THREE.MeshBasicMaterial({color:0xffff00}),10000);
this.mesh_agents_clamp_step.count=0;
this.mesh_agents_clamp_step.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
this.mesh_agents_clamp_step.frustumCulled=false;
this.mesh_agents_clamp_step.matrixAutoUpdate=false;
this.mesh_agents_clamp_step.updateMatrixWorld=function(){};
this.mesh_crowd_helpers.add(this.mesh_agents_clamp_step);


}


/** ____________________ HELPERS_UPDATE ____________________ **/


helpers_update(){


let qx=0,qy=0,qz=0,qw=0;


let mesh_agents_body_count=0;
let mesh_agents_body_instanceMatrix_array=this.mesh_agents_body.instanceMatrix.array;


let mesh_agents_arrow_count=0;
let mesh_agents_arrow_instanceMatrix_array=this.mesh_agents_arrow.instanceMatrix.array;


let mesh_agents_path_lines_count=0;
let mesh_agents_path_lines_array=this.mesh_agents_path_lines.geometry.attributes.position.array;


let mesh_agents_path_points_count=0;
let mesh_agents_path_points_instanceMatrix_array=this.mesh_agents_path_points.instanceMatrix.array;


let mesh_agents_path_next_point_count=0;
let mesh_agents_path_next_point_instanceMatrix_array=this.mesh_agents_path_next_point.instanceMatrix.array;


let mesh_agents_clamp_step_count=0;
let mesh_agents_clamp_step_instanceMatrix_array=this.mesh_agents_clamp_step.instanceMatrix.array;


for(const agent_id in agents){


let agent=agents[agent_id];


let position=agent.object.position;
let offset=mesh_agents_body_count*16;
mesh_agents_body_instanceMatrix_array[offset]=agent.radius;
mesh_agents_body_instanceMatrix_array[offset+5]=agent.height/7;
mesh_agents_body_instanceMatrix_array[offset+10]=agent.radius;
mesh_agents_body_instanceMatrix_array[offset+12]=position.x;
mesh_agents_body_instanceMatrix_array[offset+13]=position.y;
mesh_agents_body_instanceMatrix_array[offset+14]=position.z;
mesh_agents_body_count++;


let quaternion=agent.object.quaternion;
qx=quaternion.x;
qy=quaternion.y;
qz=quaternion.z;
qw=quaternion.w;


const xx2=qx*qx*2,yy2=qy*qy*2,zz2=qz*qz*2;
const xy2=qx*qy*2,xz2=qx*qz*2,yz2=qy*qz*2;
const wx2=qw*qx*2,wy2=qw*qy*2,wz2=qw*qz*2;


mesh_agents_arrow_instanceMatrix_array[offset+0]=1-yy2-zz2;
mesh_agents_arrow_instanceMatrix_array[offset+1]=xy2+wz2;
mesh_agents_arrow_instanceMatrix_array[offset+2]=xz2-wy2;
mesh_agents_arrow_instanceMatrix_array[offset+3]=0;


mesh_agents_arrow_instanceMatrix_array[offset+4]=xy2-wz2;
mesh_agents_arrow_instanceMatrix_array[offset+5]=1-xx2-zz2;
mesh_agents_arrow_instanceMatrix_array[offset+6]=yz2+wx2;
mesh_agents_arrow_instanceMatrix_array[offset+7]=0;


mesh_agents_arrow_instanceMatrix_array[offset+8]=xz2+wy2;
mesh_agents_arrow_instanceMatrix_array[offset+9]=yz2-wx2;
mesh_agents_arrow_instanceMatrix_array[offset+10]=1-xx2-yy2;
mesh_agents_arrow_instanceMatrix_array[offset+11]=0;


mesh_agents_arrow_instanceMatrix_array[offset+12]=position.x;
mesh_agents_arrow_instanceMatrix_array[offset+13]=position.y;
mesh_agents_arrow_instanceMatrix_array[offset+14]=position.z;
mesh_agents_arrow_instanceMatrix_array[offset+15]=1;
mesh_agents_arrow_count++;


let agent_path=agent.path;
let agent_path_length=agent_path.length;


if(agent.path.length){


for(let n=0;n<agent_path_length-1;n++){


let start_point=agent_path[n];
let end_point=agent_path[n+1];


let offset_start=mesh_agents_path_lines_count*3;
mesh_agents_path_lines_array[offset_start]=start_point.x;
mesh_agents_path_lines_array[offset_start+1]=start_point.y;
mesh_agents_path_lines_array[offset_start+2]=start_point.z;


let offset_end=(mesh_agents_path_lines_count+1)*3;
mesh_agents_path_lines_array[offset_end]=end_point.x;
mesh_agents_path_lines_array[offset_end+1]=end_point.y;
mesh_agents_path_lines_array[offset_end+2]=end_point.z;


mesh_agents_path_lines_count+=2;


}


for(let n=0;n<agent_path_length;n++){


let point=agent_path[n];
let offset=mesh_agents_path_points_count*16;
mesh_agents_path_points_instanceMatrix_array[offset+12]=point.x;
mesh_agents_path_points_instanceMatrix_array[offset+13]=point.y;
mesh_agents_path_points_instanceMatrix_array[offset+14]=point.z;
mesh_agents_path_points_count++;


}


if(agent.next_path_point>0){


let point=agent.path[agent.next_path_point];
let offset=mesh_agents_path_next_point_count*16;
mesh_agents_path_next_point_instanceMatrix_array[offset+12]=point.x;
mesh_agents_path_next_point_instanceMatrix_array[offset+13]=point.y;
mesh_agents_path_next_point_instanceMatrix_array[offset+14]=point.z;
mesh_agents_path_next_point_count++;


}


}


if(agent.clamp_step_state){


let position=agent.clamp_step_position;
let offset=mesh_agents_clamp_step_count*16;
mesh_agents_clamp_step_instanceMatrix_array[offset+12]=position.x;
mesh_agents_clamp_step_instanceMatrix_array[offset+13]=position.y;
mesh_agents_clamp_step_instanceMatrix_array[offset+14]=position.z;
mesh_agents_clamp_step_count++;


}


}


this.mesh_agents_body.count=mesh_agents_body_count;
this.mesh_agents_body.instanceMatrix.needsUpdate=true;


this.mesh_agents_arrow.count=mesh_agents_arrow_count;
this.mesh_agents_arrow.instanceMatrix.needsUpdate=true;


this.mesh_agents_path_lines.geometry.setDrawRange(0,mesh_agents_path_lines_count);
this.mesh_agents_path_lines.geometry.attributes.position.needsUpdate=true;


this.mesh_agents_path_points.count=mesh_agents_path_points_count;
this.mesh_agents_path_points.instanceMatrix.needsUpdate=true;


this.mesh_agents_path_next_point.count=mesh_agents_path_next_point_count;
this.mesh_agents_path_next_point.instanceMatrix.needsUpdate=true;


this.mesh_agents_clamp_step.count=mesh_agents_clamp_step_count;
this.mesh_agents_clamp_step.instanceMatrix.needsUpdate=true;


}


/** ____________________ ADD_AGENT ____________________ **/


add_agent(options){


let corridor_buffers=[[],[],[],[],[],[],[],[],[],[],[]]; // 11 БУФЕРОВ. 1 ДЛЯ ТЕКУЩЕГО И 10 ДЛЯ РАСЧЁТОВ
let path_buffers=[[],[],[],[],[],[],[],[],[],[],[]]; // 11 БУФЕРОВ. 1 ДЛЯ ТЕКУЩЕГО И 10 ДЛЯ РАСЧЁТОВ


let agent={


active:true,
object:options.object,
speed:options.speed,


radius:options.radius, // РАДИУС В АГЕНТА. ДЛЯ ПРЕДОТВРАЩЕНИЯ ПРОХОЖДЕНИЯ СКВОЗЬ СТЕНЫ И СЛИПАНИЯ БОТОВ МЕЖДУ СОБОЙ
height:options.height, // ВЫСОТА АГЕНТА. ДЛЯ ПРОВЕРОК ПРОХОДА ПОД НИЗКИМИ ПОТОЛКАМИ
max_acceleration:0.1, // МАКСИМАЛЬНОЕ УСКОРЕНИЕ (КАК БЫСТРО АГЕНТ НАБИРАЕТ СКОРОСТЬ)
max_speed:2.5, // МАКСИМАЛЬНАЯ СКОРОСТЬ ПЕРЕМЕЩЕНИЯ АГЕНТА


node_id:-1,


state:-1, // 1-НА ПОВЕРХНОСТИ, 2-ПАДАЕТ, 3-ПРИЗЕМЛИЛСЯ, 4-ПРИЗЕМЛИЛСЯ И БЛИЖАЙШАЯ НАВИГАЦИЯ НАЙДЕНА, 5-ПРИЗЕМЛИЛСЯ И БЛИЖАЙШАЯ НАВИГАЦИЯ НЕ НАЙДЕНА


corridor_buffers:corridor_buffers,
corridor:corridor_buffers[0], // ASTAR. КОРИДОР ИЗ ID УЗЛОВ ОТ СТАРТА ДО ЦЕЛИ
path_buffers:path_buffers,
path:path_buffers[0], // CHANNEL. ПУТЬ ИЗ ТОЧЕК ОТ СТАРТА ДО ЦЕЛИ
path_corridor_buffer_index:1, // КУДА ЗАПИСЫВАТЬ РЕЗУЛЬТАТ


clamp_step_state:false,
clamp_step_position:{x:0,y:0,z:0},


path_target_position:{x:0,z:0},
next_path_point:0,


quaternion:{_x:0,_y:0,_z:0,_w:0},
//position:options.object.position,
position:options.position,
before_position_y:0,
visual_y:0,
n_position:[0,0,0], // ЖЕЛАЕМАЯ ПОЗИЦИЯ
velocity:{x:0,y:0,z:0}, // ТЕКУЩАЯ СКОРОСТЬ
n_velocity:[0,0,0], // ЖЕЛАЕМАЯ СКОРОСТЬ


target_node_id:0, // ID УЗЛА ЦЕЛИ
target_position:[0,0,0], // КООРДИНАТЫ ЦЕЛИ


n_corners:0, // КОЛИЧЕСТВО УГЛОВ В НАЙДЕННОМ ПУТИ


// === НАСТРОЙКИ СГЛАЖИВАНИЯ И ОПТИМИЗАЦИИ ПУТИ (STRING PULL) ===
// Дальность «взгляда» алгоритма оптимизации пути вперед по полигонам.
// Чем больше значение, тем раньше String Pull начнет сглаживать дальние углы.
max_look_ahead:10.0, 


weapon:{},


/*
export enum AgentState {
INVALID,
WALKING,
OFFMESH,
}

export enum AgentTargetState {
NONE,
FAILED,
VALID,
REQUESTING,
WAITING_FOR_QUEUE,
WAITING_FOR_PATH,
VELOCITY,
}

export enum CrowdUpdateFlags {
ANTICIPATE_TURNS=1,
OBSTACLE_AVOIDANCE=2,
SEPARATION=4,
OPTIMIZE_VIS=8,
OPTIMIZE_TOPO=16,
}
*/

/*
radius:0,
height:0,
maxAcceleration:0,
maxSpeed:0,
collisionQueryRange:0,
pathOptimizationRange:0,
separationWeight:0,
updateFlags:0,
queryFilter:0,
obstacleAvoidance:0,
autoTraverseOffMeshConnections:0,
state:"walk",
corridor:[], // НАВИГАЦИОННЫЙ КОРИДОР АГЕНТА. ХРАНИТ ЦЕПОЧКУ ID УЗЛОВ ОТ СТАРТА ДО ЦЕЛИ, ВНУТРИ КОТОРОЙ АГЕНТ ИМЕЕТ ПРАВО ДВИГАТЬСЯ
boundary:[],
slicedQuery:0,
obstacleAvoidanceQuery:0,
obstacleAvoidanceDebugData:0,
neis:[],
corners:[], // МАССИВ КООРДИНАТ НАЙДЕННОГО ПУТИ
position:0,
desiredSpeed:0,
desiredVelocity:0,
newVelocity:0,
velocity:0,
displacement:0,
targetState:0, // ТЕКУЩИЙ СТАТУС ЗАПРОСА НА ПЕРЕМЕЩЕНИЕ (ИЩЕТ ПУТЬ, ИДЕТ К ЦЕЛИ, ПРИШЕЛ, ОЖИДАЕТ)
targetRef:0,
targetPosition:0,
targetReplan:false,
targetPathfindingTime:0,
targetPathIsPartial:true,
topologyOptTime:0,
offMeshAnimation:{t:0,startPosition:0,endPosition:0,nodeRef:0,duration:0}
*/

/*
// === ЧАСТОТА ПЕРЕРАСЧЕТА (ОПТИМИЗАЦИИ) ===
// Разрешает алгоритму периодически перестраивать цепочку полигонов (Topology)
// для поиска более коротких путей/срезок в динамической среде.
updateFlags:0,
updateFlags|:DT_CROWD_OPTIMIZE_TOPO, // Включаем оптимизацию топологии пути
updateFlags|:DT_CROWD_OPTIMIZE_VIS,  // Включаем Raycast-оптимизацию (срезка по прямой)


// === НАСТРОЙКИ ЛОКАЛЬНОГО УКЛОНЕНИЯ (OBSTACLE AVOIDANCE) ===
// Включаем адаптивную выборку скоростей (кастомный "RVO" в Detour)
updateFlags|:DT_CROWD_ANTICIPATE_TURNS, // Плавное замедление и наклон при входе в поворот
updateFlags|:DT_CROWD_OBSTACLE_AVOIDANCE, // Включаем уклонение от соседей
updateFlags|:DT_CROWD_SEPARATION, // Включаем расталкивание при давке


// Индекс пресета качества уклонения (настраивается отдельно в dtCrowd)
// Задает количество лучей выборки (семплов) для поиска безопасного вектора.
obstacleAvoidanceType:3, // Высокое качество (Adaptive Sampling)



*/
}


this.app.scene.add(options.object);
agents[options.name]=agent;


return agent; 


}


/** ____________________ REMOVE_AGENT ____________________ **/


remove_agent(id){


if(agents[agent_id]){
delete agents[agent_id];
return true;
}
return false;


}


/** ____________________ SET_DATA ____________________ **/


set_data(zone_name){


let data=this.app.pathfinder.zones[zone_name];


nodes=data.nodes;
vertices=data.vertices;
nodes_2=data.nodes_2;
groups=data.groups;
detail_mesh_nodes=data.detail_mesh_nodes;


this.nodes=data.nodes;
this.vertices=data.vertices;
this.nodes_2=data.nodes_2;
this.groups=data.groups;
this.detail_mesh_nodes=data.detail_mesh_nodes;
this.navigation_grid=data.navigation_grid;
this.navigation_detail_mesh=data.navigation_detail_mesh;


let navigation_grid=data.navigation_grid;


navigation_grid_cells_size_xz=navigation_grid.cells_size_xz;
navigation_grid_cells_size_y=navigation_grid.cells_size_y;


navigation_grid_cells_array=navigation_grid.cells_array;
navigation_grid_cells_count=navigation_grid.cells_count;


navigation_grid_cells_min_x_meter=navigation_grid.cells_min_x_meter;
navigation_grid_cells_max_x_meter=navigation_grid.cells_max_x_meter;
navigation_grid_cells_min_z_meter=navigation_grid.cells_min_z_meter;
navigation_grid_cells_max_z_meter=navigation_grid.cells_max_z_meter;
navigation_grid_cells_min_y_meter=navigation_grid.cells_min_y_meter;
navigation_grid_cells_max_y_meter=navigation_grid.cells_max_y_meter;


navigation_grid_cells_min_x_num=navigation_grid.cells_min_x_num;
navigation_grid_cells_max_x_num=navigation_grid.cells_max_x_num;
navigation_grid_cells_min_z_num=navigation_grid.cells_min_z_num;
navigation_grid_cells_max_z_num=navigation_grid.cells_max_z_num;
navigation_grid_cells_min_y_num=navigation_grid.cells_min_y_num;
navigation_grid_cells_max_y_num=navigation_grid.cells_max_y_num;


navigation_detail_mesh_climb=data.navigation_detail_mesh_climb;
navigation_detail_mesh_height=data.navigation_detail_mesh_height;


let navigation_detail_mesh=data.navigation_detail_mesh;


navigation_detail_mesh_cells_size_xz=navigation_detail_mesh.cells_size_xz;
navigation_detail_mesh_cells_size_y=navigation_detail_mesh.cells_size_y;


navigation_detail_mesh_cells_array=navigation_detail_mesh.cells_array;
navigation_detail_mesh_cells_count=navigation_detail_mesh.cells_count;


navigation_detail_mesh_cells_min_x_meter=navigation_detail_mesh.cells_min_x_meter;
navigation_detail_mesh_cells_max_x_meter=navigation_detail_mesh.cells_max_x_meter;
navigation_detail_mesh_cells_min_z_meter=navigation_detail_mesh.cells_min_z_meter;
navigation_detail_mesh_cells_max_z_meter=navigation_detail_mesh.cells_max_z_meter;
navigation_detail_mesh_cells_min_y_meter=navigation_detail_mesh.cells_min_y_meter;
navigation_detail_mesh_cells_max_y_meter=navigation_detail_mesh.cells_max_y_meter;


navigation_detail_mesh_cells_min_x_num=navigation_detail_mesh.cells_min_x_num;
navigation_detail_mesh_cells_max_x_num=navigation_detail_mesh.cells_max_x_num;
navigation_detail_mesh_cells_min_z_num=navigation_detail_mesh.cells_min_z_num;
navigation_detail_mesh_cells_max_z_num=navigation_detail_mesh.cells_max_z_num;
navigation_detail_mesh_cells_min_y_num=navigation_detail_mesh.cells_min_y_num;
navigation_detail_mesh_cells_max_y_num=navigation_detail_mesh.cells_max_y_num;


}


/** ____________________ NEW_PATH ____________________ **/


new_path(pt){


const agent=agents["0"];


let result=this.pathfinder.find_simple_path(agent,pt);


if(result){


agent.next_path_point=1;
set_target_direction(agent);
agent.clamp_step_state=false;


}
else{


agent.corridor.length=0;
agent.path.length=0;
agent.next_path_point=0;


agent.clamp_step_state=true;


console.log("CLAMPED NODE NOW ID: "+agent.node_id);
console.log(nodes[agent.node_id]);


let clamped=this.pathfinder.clamp_step(nodes[agent.node_id],pt,agent.clamp_step_position,200);


}


}


/** ____________________ MOVE ____________________ **/


move(agent,delta_time){


const speed=agent.speed;


let path_target_position=agent.path_target_position;
let velocity=agent.velocity;


if(agent.next_path_point!=0){


let cp=agent.path[agent.next_path_point];
path_target_position.x=cp.x;
path_target_position.z=cp.z;


velocity.x=cp.x-agent.position.x;
velocity.z=cp.z-agent.position.z;


let velocity_length_square=velocity.x*velocity.x+velocity.z*velocity.z;


let path_leg_complete=false;
// !!! ЭТО НА УГЛАХ ДАЁТ ОТТАЛКИВАНИЕ. ПЕРЕДЕЛАТЬ 
//if(velocity_length_square<0.0025){path_leg_complete=true; console.log(velocity_length_square+" VVVVVVVVVV "+cp.x+" "+cp.z+" "+agent.position.x+" "+agent.position.z);}
//console.log(agent.next_path_point);


if(!path_leg_complete){


let dx=agent.position.x-path_target_position.x;
let dz=agent.position.z-path_target_position.z;
let previous_distanceToSquared=dx*dx+dz*dz;


let old=velocity.x;
let divide=1/Math.sqrt(velocity_length_square);
if(velocity_length_square==0){divide=0;}
velocity.x*=divide;
velocity.y*=divide;
velocity.z*=divide;


agent.object.quaternion.slerp(agent.quaternion,0.1);


let delta_time_speed=delta_time*50;
velocity.x*=delta_time_speed;
velocity.y*=delta_time_speed;
velocity.z*=delta_time_speed;
  

velocity.y=0;


agent.velocity.x=velocity.x;
agent.velocity.y=velocity.y;
agent.velocity.z=velocity.z;

/*
agent.velocity.x=0-0.05;
agent.velocity.x=0;
agent.velocity.y=0;
agent.velocity.z=-62.5/100;
*/

step_agent(agent,delta_time);


dx=agent.position.x-path_target_position.x;
dz=agent.position.z-path_target_position.z;
let new_distanceToSquared=dx*dx+dz*dz;


// ЗДЕСЬ ИМЕННО >=. ЕСЛИ ОСТАВИТЬ ТОЛЬКО >, ТО КОГДА БУДЕТ=ДИСТАНЦИИ, ТО БУДЕТ БЕСКОНЕЧНО ПРОВЕРЯТЬ, Т.К.=УДАЛЕНО
path_leg_complete=(new_distanceToSquared >= previous_distanceToSquared);
//console.log(Math.sqrt(new_distanceToSquared)+" "+Math.sqrt(previous_distanceToSquared)+" "+path_leg_complete);
//console.log(velocity_length_square+" fghfghfg "+cp.x+" "+cp.z+" "+agent.position.x+" "+agent.position.z+" Y="+agent.position.y);


} 


if(path_leg_complete){


console.log("FINISH");


agent.next_path_point++;


if(agent.next_path_point>=agent.path.length){
agent.next_path_point=0;
}


if(agent.next_path_point==0){
}
else{
set_target_direction(agent);
}


}


}


}


/** ____________________ UPDATE ____________________ **/


update(delta_time){


for(let agent_id in agents){


let agent=agents[agent_id];


let agent_position=agent.position;
let agent_object_position=agent.object.position;


agent.before_position_y=agent_position.y;


if(agent.state===1){
this.move(agent,delta_time);
}


/** ____________________ VISUAL_Y ____________________ **/


// СГЛАЖИВАНИЕ ПОДЪЁМА ПО ЛЕСТНИЦЕ ВЫПОЛНЯЕМ ОТДЕЛЬНО, Т.К. ПОСЛЕ ДВИЖЕНИЯ, АГЕНТ МОГ СМЕНИТЬ state.
// И ВЫПОЛНЯЕМ ТОЛЬКО КОГДА ИДЁТ ПО НАВИГАЦИИ, А ПРИ СХОДЕ С НЕЁ, ОТКЛЮЧАЕТСЯ И УЖЕ С ПОМОЩЬЮ КАПСУЛЫ ФИЗИКИ ПОДНИМАЕТСЯ


if(agent.state===1){


let smoothing_factor=15; // ЧЕМ ВЫШЕ, ТЕМ БЫСТРЕЕ ВИЗУАЛ ДОГОНЯЕТ ФИЗИКУ
let base_step=Math.exp(-smoothing_factor*delta_time); // ЭКСПОНЕНЦИАЛЬНЫЙ ШАГ ДЕЛАЕТ ПЛАВНОСТЬ АБСОЛЮТНО ОДИНАКОВОЙ ПРИ ЛЮБОМ FPS
let stepThreshold=0.03; // 3 СМ — ЗОНА ДЛЯ ИГНОРИРОВАНИЯ ПЛАВНЫХ СКЛОНОВ
let maxStepHeight=0.30; // МАКСИМАЛЬНАЯ ВЫСОТА СТУПЕНИ/ПОДЪЁМА


let actualDeltaY=agent_position.y-agent.before_position_y;


// ФИЛЬТРУЕМ:СГЛАЖИВАЕМ ТОЛЬКО РЕЗКИЕ СТУПЕНЧАТЫЕ СКАЧКИ ГЕОМЕТРИИ
if(Math.abs(actualDeltaY)>stepThreshold){


// Ограничиваем дельту одного шага рамками максимальной ступени
let clamped_delta_y=Math.max(-maxStepHeight,Math.min(maxStepHeight,actualDeltaY));


// НАКОПЛЕНИЕ ОШИБКИ:ВЫЧИТАЕМ ДЕЛЬТУ ИЗ БУФЕРА
agent.visual_y-=clamped_delta_y;


// КЛЭМПИМ ОБЩИЙ БУФЕР ОШИБКИ, ЧТОБЫ ПРИ ПАДЕНИИ С ОБРЫВА ВИЗУАЛ НЕ ОТСТАВАЛ СЛИШКОМ СИЛЬНО
agent.visual_y=Math.max(-maxStepHeight,Math.min(maxStepHeight,agent.visual_y));


}


// ПЛАВНО УМЕНЬШАЕМ БУФЕР ОШИБКИ ВО ВРЕМЕНИ (НЕЗАВИСИМО ОТ FPS)
if(Math.abs(agent.visual_y)>0.001){ agent.visual_y*=base_step; }
else{ agent.visual_y=0; }


agent_object_position.x=agent_position.x;
agent_object_position.y=agent_position.y+agent.visual_y-get_detail_mesh_y_offset;
agent_object_position.z=agent_position.z;


}


}


// ФИЗИКА


for(let agent_id in agents){


let agent=agents[agent_id];


let agent_position=agent.position;
let agent_object_position=agent.object.position;
let agent_velocity=agent.velocity;


/** ____________________ БОТ ЛЕТИТ УЖЕ ДАВНО ____________________ **/


// СПЕРВА ИДЁТ state===3. ЧТОБЫ 3 СРАБОТАЛ В СЛЕДУЮЩЕМ КАДРЕ, КОГДА ПЕРЕКЛЮЧИТСЯ В state===2


if(agent.state===3){


// НАКАПЛИВАЕМ СКОРОСТЬ ГРАВИТАЦИИ И ОГРАНИЧИВАЕМ ЕЁ
agent_velocity.y=Math.max(agent_velocity.y-9.81*delta_time,-40);


// СБОРКА ВЕКТОРА ПЕРЕМЕЩЕНИЯ
physics_movement_vector.x=agent_velocity.x*delta_time;
physics_movement_vector.y=agent_velocity.y*delta_time;
physics_movement_vector.z=agent_velocity.z*delta_time;


// ВЫЧИСЛЕНИЕ ДВИЖЕНИЯ ЧЕРЕЗ RAPIER
this.characterController.computeColliderMovement(this.player.userData.collider,physics_movement_vector);


// ЗАБИРАЕМ ИТОГОВЫЙ, МАТЕМАТИЧЕСКИ ОТФИЛЬТРОВАННЫЙ СДВИГ
let computedMovement=this.characterController.computedMovement();


// ЗАПИСЫВАЕМ ФИНАЛЬНЫЙ РЕЗУЛЬТАТ.
// ЕСЛИ ВПЕРЕДИ ГЛУХАЯ СТЕНА-computedMove САМ СТАНЕТ РАВЕН 0 И БОТ ПРИЛИПНЕТ БЕЗ ОТСКОКОВ.
// ЕСЛИ ВПЕРЕДИ ЛЕСТНИЦА-computedMove САМ ПОЙДЕТ ПО ДИАГОНАЛИ ВВЕРХ.
physics_translation.x=computedMovement.x;
physics_translation.y=computedMovement.y;
physics_translation.z=computedMovement.z;


// ЕСЛИ МЫ ХОТЕЛИ УПАСТЬ ВНИЗ ИЗ-ЗА ГРАВИТАЦИИ, НО ДВИЖОК ПРОПУСТИЛ НАС НА МЕНЬШЕЕ РАССТОЯНИЕ,
// ЗНАЧИТ ПОД НОГАМИ ГАРАНТИРОВАННО ОКАЗАЛАСЬ ПОВЕРХНОСТЬ, СБРАСЫВАЕМ СКОРОСТЬ ПАДЕНИЯ 
if(this.characterController.computedGrounded()){
if(computedMovement.y<-0.001){
agent_velocity.y=computedMovement.y/delta_time; 
}
else if(computedMovement.y>physics_movement_vector.y+0.00001 || Math.abs(computedMovement.y-physics_movement_vector.y)>=0.001){
agent_velocity.y=0; 
}
}


this.characterController.computeColliderMovement(this.player.userData.collider,physics_translation);
let corrected_computedMovement=this.characterController.computedMovement();


// ВЫЧИСЛЯЕМ НАКОПЛЕННУЮ КОНЕЧНУЮ 3D-ТОЧКУ КАДРА В ВОЗДУХЕ
physics_final.x=agent_position.x+corrected_computedMovement.x;
physics_final.y=agent_position.y+corrected_computedMovement.y;
physics_final.z=agent_position.z+corrected_computedMovement.z;


// ПЕРЕДАЕМ В RAPIER ФИНАЛЬНЫЕ КООРДИНАТЫ
this.player.userData.body.setNextKinematicTranslation(physics_final);


agent_position.x=physics_final.x;
agent_position.y=physics_final.y;
agent_position.z=physics_final.z;


agent_object_position.x=agent_position.x;
agent_object_position.y=agent_position.y-get_detail_mesh_y_offset;
agent_object_position.z=agent_position.z;


}


/** ____________________ БОТ ВЫЛЕТЕЛ ТОЛЬКО ЧТО В ЭТОМ КАДРЕ ____________________ **/


if(agent.state===2){


agent.state=3;


// ДОБАВЛЯЕМ НЕБОЛЬШОЙ ОТСТУП ВВЕРХ 0.001 (ЭТОГО ДОСТАТОЧНО), Т.К. ЭТО ПЕРВОЕ ПОЯВЛЕНИЕ НА РЕАЛЬНОЙ ПОВЕРХНОСТИ И ЕЁ ВЫСОТА В ФИЗИКЕ МОЖЕТ БЫТЬ СЛЕГКА ВЫШЕ,
// Т.Е. ЕСЛИ НЕ СМЕСТИТЬ, ТО СЛЕГКА ЗАСТРЯНЕТ И ПОЙДЁТ НЕ ТУДА ИЛИ ПОДПРЫГНЕТ
physics_translation.x=agent_position.x;
physics_translation.y=agent_position.y+0.001;
physics_translation.z=agent_position.z;


this.player.userData.body.setTranslation(physics_translation,true);
this.physics.step(0); // ОБЯЗАТЕЛЬНО ОБНОВЛЯЕМ СМЕЩЕНИЕ В ЭТОМ КАДРЕ, ИНАЧЕ computeColliderMovement НЕ УВИДИТ НОВОЕ ЗНАЧЕНИЕ


physics_translation.x=agent.air_wish_delta_x;
physics_translation.y=agent.slope_velocity_y;
physics_translation.z=agent.air_wish_delta_z;


agent_velocity.y/=delta_time;


this.characterController.computeColliderMovement(this.player.userData.collider,physics_translation);
const corrected_computedMovement=this.characterController.computedMovement();


// ВЫЧИСЛЯЕМ НАКОПЛЕННУЮ КОНЕЧНУЮ 3D-ТОЧКУ КАДРА В ВОЗДУХЕ
physics_final.x=agent_position.x+corrected_computedMovement.x;
physics_final.y=agent_position.y+corrected_computedMovement.y;
physics_final.z=agent_position.z+corrected_computedMovement.z;


// ПЕРЕДАЕМ В RAPIER ФИНАЛЬНЫЕ КООРДИНАТЫ
this.player.userData.body.setNextKinematicTranslation(physics_final);


agent_position.x=physics_final.x;
agent_position.y=physics_final.y;
agent_position.z=physics_final.z;


agent_object_position.x=agent_position.x;
agent_object_position.y=agent_position.y-get_detail_mesh_y_offset;
agent_object_position.z=agent_position.z;


}


}


this.physics.step(delta_time);


if(this.crowd_debug){
this.helpers_update();
}


}


}


window.move_along_surface=move_along_surface;
window.nodes=nodes;


export {crowd};