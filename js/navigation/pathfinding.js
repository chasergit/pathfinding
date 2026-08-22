import {astar} from "./astar.js";
import {channel} from "./channel.js";
import {navigation_builder} from "./navigation_builder.js";


let nodes;
let vertices;
let nodes_2;
let groups;
let detail_mesh_nodes;


let unique_set=new Set();
let found_nodes=[];
let get_random_point_in_node_result={x:0,y:0,z:0};
let max_distance_to_floor=0.2; // МАКСИМАЛЬНАЯ ДИСТАНЦИЯ ДО ПОВЕРХНОСТИ ТРЕУГОЛЬНИКА, ЧТОБЫ СЧИТАТЬ ЧТО ТОЧКА НАХОДИТСЯ НА НЁМ


// БУФЕР ДЛЯ СБОРА ТРЕУГОЛЬНИКОВ НА ОДИН КАДР
let navigation_grid_found_nodes=new Int32Array(10000);
let navigation_grid_found_count=0;
// МАССИВ ФЛАГОВ УНИКАЛЬНОСТИ. ИНДЕКСИРУЕТСЯ ПО ID ТРЕУГОЛЬНИКА (ДО 1 000 000)
let navigation_grid_nodes_visited_flags=new Int32Array(1000000); 
let navigation_grid_search_id=0;


let navigation_spatial_shift_x=17179869184; // 2^34
let navigation_spatial_shift_z=131072; // 2^17
let navigation_spatial_offset=65536; // СИММЕТРИЧНЫЙ СДВИГ ВО ВСЕ СТОРОНЫ КУБА


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


// ____________________ is_point_in_triangle_2d_exact_boolean ____________________


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


// ____________________ is_point_in_triangle_2d_margin ____________________



// margin_xz-ЭТО ОТСТУП В МЕТРАХ ПО ОСЯМ XZ. ЗАРАНЕЕ УМНОЖАЕМ НА СЕБЯ. ЕСЛИ НАДО 0.05, ТО ПЕРЕДАЁМ 0.0025. ДА 0.05*0.05=0.0025, А НЕ 0.25


function is_point_in_triangle_2d_margin(node,point,margin_xz){


const point_x=point.x;
const point_z=point.z;


// СЧИТАЕМ ЧИСТЫЕ ЗНАКОВЫЕ ПЛОЩАДИ
const edge0=(point_x-node.ax)*node.abz-(point_z-node.az)*node.abx;
const edge1=(point_x-node.bx)*node.bcz-(point_z-node.bz)*node.bcx;
const edge2=(point_x-node.cx)*node.caz-(point_z-node.cz)*node.cax;


// ПОКАЗАТЬ МИНИМАЛЬНОЕ РАССТОЯНИЕ ДО РЕБРА. СРЕДИ РАССТОЯНИЙ 0.05,0.0,0.03 С УЧЁТОМ ОТСТУПА 0.5, ПОКАЖЕТ РАССТОЯНИЕ 0
const isInside=(edge0>=0 || (edge0*edge0<=margin_xz*node.ab_length_sq_xz)) && (edge1>=0 || (edge1*edge1<=margin_xz*node.bc_length_sq_xz)) && (edge2>=0 || (edge2*edge2<=margin_xz*node.ca_length_sq_xz));
if(isInside){
const len0=node.ab_length_sq_xz;
const len1=node.bc_length_sq_xz;
const len2=node.ca_length_sq_xz;
const sq0=edge0*edge0;
const sq1=edge1*edge1;
const sq2=edge2*edge2;
let best_sq=sq0;
let best_len=len0;
if(sq1*best_len<best_sq*len1){
best_sq=sq1;
best_len=len1;
}
if(sq2*best_len<best_sq*len2){
best_sq=sq2;
best_len=len2;
}
//console.log("NODE ID: "+node.id+". DISTANCE TO EDGE: "+Math.sqrt(best_sq/best_len));
return Math.sqrt(best_sq/best_len);
}
else{
//console.log("NODE ID: "+node.id+". DISTANCE TO EDGE: NOT FOUND");
return false;
}


// ДЛЯ ТРЕУГОЛЬНИКОВ, ЗАКРУЧЕННЫХ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ
//return (edge0>=0 || (edge0*edge0<=margin_xz*node.ab_length_sq_xz)) && (edge1>=0 || (edge1*edge1<=margin_xz*node.bc_length_sq_xz)) && (edge2>=0 || (edge2*edge2<=margin_xz*node.ca_length_sq_xz));


}


// ____________________ is_point_in_triangle_3d_exact_distance_y ____________________


function is_point_in_triangle_3d_exact_distance_y(node,point){


const point_x=point.x;
const point_y=point.y;
const point_z=point.z;


/**
// ИМЕННО ЗДЕСЬ ОПРЕДЕЛЯЕМ ПЕРЕМЕННУЮ, А НЕ В ФОРМУЛЕ. ТАК РАБОТАЕТ БЫСТРЕЕ
const inv_ny=node.inv_ny;
// НАХОДИМ РЕАЛЬНОЕ ЗНАЧЕНИЕ Y В ТОЧКЕ XZ
const expected_y=-(node.nx*point_x+node.nz*point_z+node.plane_constant)*inv_ny;
**/
// ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ УБРАНЫ, ТАК РАССЧИТАТЬ БЫСТРЕЕ
const expected_y=node.scaled_nx*point_x+node.scaled_nz*point_z+node.scaled_constant;
// СЧИТАЕМ РАЗНИЦУ МЕЖДУ ВЫСОТОЙ ТОЧКИ И РЕАЛЬНОЙ ПОВЕРХНОСТЬЮ СКЛОНА
const difference_y=point_y-expected_y;
// ВНЕ ОТСТУПА
if(difference_y<-1 || difference_y>max_distance_to_floor){ return false; }


// СЧИТАЕМ ЧИСТЫЕ ЗНАКОВЫЕ ПЛОЩАДИ
const edge0=(point_x-node.ax)*node.abz-(point_z-node.az)*node.abx;
const edge1=(point_x-node.bx)*node.bcz-(point_z-node.bz)*node.bcx;
const edge2=(point_x-node.cx)*node.caz-(point_z-node.cz)*node.cax;


// ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ
if(edge0>=0 && edge1>=0 && edge2>=0){ return difference_y; }


return false;


}


// ____________________ is_point_in_triangle_3d_margin ____________________


/**
margin_xz-ЭТО ОТСТУП В МЕТРАХ ПО ОСЯМ XZ. ЗАРАНЕЕ УМНОЖАЕМ НА СЕБЯ. ЕСЛИ НАДО 0.05, ТО ПЕРЕДАЁМ 0.0025. ДА 0.05*0.05=0.0025, А НЕ 0.25
ЗАЩИТА УГЛОВ КАРТЫ: ДВУХСТОРОННИЙ CLAMP-ЗАЖИМ T ПРИНУДИТЕЛЬНО СТЯГИВАЕТ МАТЕМАТИКУ К ФИЗИЧЕСКИМ ВЕРШИНАМ НА ОСТРЫХ УГЛАХ, ИСКЛЮЧАЯ НАСЛОЕНИЕ ТРЕУГОЛЬНИКОВ.
ИДЕАЛЬНЫЕ ШВЫ И СТЫКИ: ЭВРИСТИКА min_square_xz > 0.00001 НИВЕЛИРУЕТ ДРЕБЕЗГ ЧИСЕЛ С ПЛАВАЮЩЕЙ ТОЧКОЙ В JS, СОХРАНЯЯ АСИММЕТРИЮ И СКОРОСТЬ РАННЕГО ВЫХОДА.
**/


/**
ПРОВЕРКА inv_len===0 УБРАНА, Т.К. ИЗНАЧАЛЬНО УБРАЛИ ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ ИЗ ГЕОМЕТРИИ ОБЪЕКТА
const inv_len=node.inv_ab_length_sq_xz; 
if(inv_len===0){
min_square_xz=dxa*dxa+dza*dza;
}else{
**/


function is_point_in_triangle_3d_margin(node,point,margin_xz){


const point_x=point.x;
const point_y=point.y;
const point_z=point.z;

/**
// ИМЕННО ЗДЕСЬ ОПРЕДЕЛЯЕМ ПЕРЕМЕННУЮ, А НЕ В ФОРМУЛЕ. ТАК РАБОТАЕТ БЫСТРЕЕ
const inv_ny=node.inv_ny;
// НАХОДИМ РЕАЛЬНОЕ ЗНАЧЕНИЕ Y В ТОЧКЕ XZ
const expected_y=-(node.nx*point_x+node.nz*point_z+node.plane_constant)*inv_ny;
**/
// ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ УБРАНЫ, ТАК РАССЧИТАТЬ БЫСТРЕЕ
const expected_y=node.scaled_nx*point_x+node.scaled_nz*point_z+node.scaled_constant;
// СЧИТАЕМ РАЗНИЦУ МЕЖДУ ВЫСОТОЙ ТОЧКИ И РЕАЛЬНОЙ ПОВЕРХНОСТЬЮ СКЛОНА
const difference_y=point_y-expected_y;
// ВНЕ ОТСТУПА
if(difference_y<-2 || difference_y>max_distance_to_floor){ return false; }


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
}


// РЕБРО 1: ОТРЕЗОК BC
if(edge1<0){
outside=true;
// ЗАЩИТА ШВА: УЧИТЫВАЕМ ДРЕБЕЗГ FLOAT В JS ЧЕРЕЗ ЭТОТ ПОРОГ
if(min_square_xz>margin_xz){ 
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
if(dist_sq<min_square_xz){ min_square_xz=dist_sq; }
}
}


// РЕБРО 2: ОТРЕЗОК CA
if(edge2<0){
outside=true;
// ЗАЩИТА ШВА: УЧИТЫВАЕМ ДРЕБЕЗГ FLOAT В JS ЧЕРЕЗ ЭТОТ ПОРОГ
if(min_square_xz>margin_xz){ 
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
if(dist_sq<min_square_xz){ min_square_xz=dist_sq; }
}
}


if(!outside){ min_square_xz=0; }


// ПРОВЕРЯЕМ ИТОГОВЫЙ МАРЖИН ТОЛЬКО ЕСЛИ ТОЧКА РЕАЛЬНО СНАРУЖИ
if(outside && min_square_xz>margin_xz){ return false; }


// СЧИТАЕМ КВАДРАТ ЧЕСТНОГО 3D РАССТОЯНИЯ (ТЕОРЕМА ПИФАГОРА)
// КВАДРАТ ГИПОТЕНУЗЫ=КВАДРАТ КАТЕТА XZ+КВАДРАТ КАТЕТА Y
// ЕСЛИ НАДО РЕАЛЬНОЕ РАССТОЯНИЕ, ТО ДОБАВЛЯЕМ Math.sqrt();
return min_square_xz+difference_y*difference_y;


}


class pathfinding {


constructor(){


this.astar=astar;
this.channel=channel;
this.zones={};


}


// ____________________ build_zone ____________________


build_zone(options){

	
this.zones[options.zone_name]=navigation_builder.build_zone(options);


}


// ____________________ set_data ____________________


set_data(zone_name){


let data=this.zones[zone_name];


astar.set_data(data.nodes);


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


// ____________________ get_node_exact ____________________


// ПОИСК ТОЧНОГО УЗЛА ПО ПОЗИЦИИ


get_node_exact(position){


let closest_node=null;
let closest_distance_y=Infinity;
let point_y=position.y;


const x=Math.floor(position.x/navigation_grid_cells_size_xz);
const z=Math.floor(position.z/navigation_grid_cells_size_xz);


let start_y=Math.floor(point_y/navigation_grid_cells_size_y);
let end_y=Math.floor((point_y-max_distance_to_floor)/navigation_grid_cells_size_y);


let cell_base_key=(x+navigation_spatial_offset)*navigation_spatial_shift_x+(z+navigation_spatial_offset)*navigation_spatial_shift_z;


unique_set.clear();
found_nodes.length=0;


for(let y=start_y;y>=end_y;y--){


const cell_key=cell_base_key+(y+navigation_spatial_offset);
let cell=navigation_grid_cells_array.get(cell_key);
   
   
if(cell==undefined){ continue; }


// ДОБАВЛЯЕМ ТОЛЬКО УНИКАЛЬНЫЕ ЗНАЧЕНИЯ
for(let k=0;k<cell.length;k++){
let item=cell[k];
if(!unique_set.has(item)){
unique_set.add(item);
found_nodes[found_nodes.length]=item;
}
}


}


if(found_nodes.length==0){ return null; }


for(let n=0,max=found_nodes.length;n<max;n++){


let node=nodes[found_nodes[n]];


let distance_y=is_point_in_triangle_3d_exact_distance_y(node,position);
// ИМЕННО !==false, А НЕ !=false, Т.К. ЗНАЧЕНИЕ 0 ТОЖЕ СЧИТАЕТСЯ КАК false
if(distance_y!==false && distance_y<closest_distance_y){
closest_node=node;
closest_distance_y=distance_y;
}


}


return closest_node;


}


// ____________________ get_node_margin ____________________


get_node_margin(position){


let point_y=position.y;


const x=Math.floor(position.x/navigation_grid_cells_size_xz);
const z=Math.floor(position.z/navigation_grid_cells_size_xz);


let start_y=Math.floor(point_y/navigation_grid_cells_size_y);
let end_y=Math.floor((point_y-max_distance_to_floor)/navigation_grid_cells_size_y);


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


// ____________________ getRandomNodeCentroidPosition ____________________


// НАХОДИТ СЛУЧАЙНУЮ ПОЗИЦИЮ ЦЕНТРА УЗЛА В РАДИУСЕ
// ПОЗИЦИЮ МОЖНО НЕ УКАЗЫВАТЬ
// РАДИУС МОЖНО НЕ УКАЗЫВАТЬ


getRandomNodeCentroidPosition(group_id,nearPosition,nearRange){


const nodes_from_group=groups[group_id];


// СЦЕНАРИЙ 1: БЫСТРЫЙ ВЫБОР ПО СЕТКЕ В РАДИУСЕ
if(nearPosition && nearRange>0){
const point_x=nearPosition.x;
const point_z=nearPosition.z;
const nearRange_2=nearRange*nearRange;


// ОПРЕДЕЛЯЕМ ГРАНИЦЫ ЯЧЕЕК, КОТОРЫЕ ПЕРЕКРЫВАЕТ РАДИУС
const size=town_tris_size;
const startX=Math.floor((point_x-nearRange)/size);
const endX=Math.floor((point_x+nearRange)/size);
const startZ=Math.floor((point_z-nearRange)/size);
const endZ=Math.floor((point_z+nearRange)/size);


let chosenCentroid=null;
let count=0;


// ПЕРЕБИРАЕМ ТОЛЬКО ЛОКАЛЬНЫЕ ЯЧЕЙКИ ВОКРУГ ПОЗИЦИИ
for(let cx=startX;cx<=endX;cx++){
for(let cz=startZ;cz<=endZ;cz++){
const cell_name=cx+"_"+cz;
const item=town_tris_cell[cell_name];
if(!item){ continue; }


for (let n=0,len=item.length;n<len;n++){
const node=nodes_from_group[item[n]];


const centroid=node.centroid;
const dx=point_x-centroid.x;
const dz=point_z-centroid.z;


// БЫСТРАЯ 2D-ОТСЕЧКА (ГРУБАЯ ПРОВЕРКА ПО КВАДРАТУ НА ПЛОСКОСТИ XZ)
if(dx*dx+dz*dz>nearRange_2){ continue; }


// Точная 3D-проверка
const dy=nearPosition.y-centroid.y;
const distance=dx*dx+dy*dy+dz*dz;


if(distance<nearRange_2){
count++;
if(Math.random()*count<1){
chosenCentroid=centroid;
}
}
}
}
}
return chosenCentroid || {x:0,y:0,z:0};
} 


// СЦЕНАРИЙ 2: МГНОВЕННЫЙ ВЫБОР БЕЗ РАДИУСА (O(1))
const max=nodes_from_group.length;
const randomIndex=(Math.random()*max) | 0;
return nodes_from_group[randomIndex].centroid;


}


// ____________________ get_group ____________________


// ПОИСК ГРУППЫ ПО ПОЗИЦИИ


get_group(position,check_triangle=false){


let closest_nodeGroup=null;
let distance=1; // МИНИМАЛЬНАЯ ДИСТАНЦИЯ ДО ЦЕНТРОИДА


const point_x=position.x;
const point_y=position.y;
const point_z=position.z;


for(let i=0;i<groups.length;i++){


const group=groups[i];


for (let j=0;j<group.length;j++){


const node=nodes[group[j]];


if(check_triangle){


//plane.projectPoint;
const distance_to_plane=node.nx*point_x+node.ny*point_y+node.nz*point_z+node.plane_constant;


// ЗАМЕНА MATH.ABS(X)<0.01 ДЛЯ СКОРОСТИ
if(distance_to_plane>-0.01 && distance_to_plane<0.01){


if(is_point_in_triangle_2d_exact_boolean(node,position)){
return i;
}


}


}


//plane.distanceToPoint(position);


const dx=node.centroid_x-point_x;
const dy=node.centroid_y-point_y;
const dz=node.centroid_z-point_z;
const measured_distance=dx*dx+dy*dy+dz*dz;


if(measured_distance<distance){
closest_nodeGroup=i;
distance=measured_distance;
}
}
}


return closest_nodeGroup;


}


// ____________________ get_random_point_in_node ____________________


get_random_point_in_node(node){


let vertex_a=node.vertex_a;
let vertex_a_x=vertex_a.x;
let vertex_a_y=vertex_a.y;
let vertex_a_z=vertex_a.z;
let vertex_b=node.vertex_b;
let vertex_c=node.vertex_c;


let r=Math.random();
let s=Math.random();


if(r+s>1.0){
r=1.0-r;
s=1.0-s;
}


let edge_AB_x=vertex_b.x-vertex_a_x;
let edge_AB_y=vertex_b.y-vertex_a_y;
let edge_AB_z=vertex_b.z-vertex_a_z;


let edge_AC_x=vertex_c.x-vertex_a_x;
let edge_AC_y=vertex_c.y-vertex_a_y;
let edge_AC_z=vertex_c.z-vertex_a_z;


get_random_point_in_node_result.x=vertex_a_x+(edge_AB_x*r)+(edge_AC_x*s);
get_random_point_in_node_result.y=vertex_a_y+(edge_AB_y*r)+(edge_AC_y*s);
get_random_point_in_node_result.z=vertex_a_z+(edge_AB_z*r)+(edge_AC_z*s);


return get_random_point_in_node_result;

	
}


// ____________________ find_path ____________________


find_simple_path(agent,end_position){


let agent_path=agent.path;


let node_start=nodes[agent.node_id];
let start_position=agent.position;
let node_end=this.get_node_exact(end_position);


// ЕСЛИ СТАРТОВЫЙ И КОНЕЧНЫЙ УЗЛЫ СОВПАДАЮТ
if(node_start==node_end){
	
	
agent.corridor.length=1;
agent.corridor[0]=node_start;
agent_path.length=2;
agent_path[0]=start_position;
agent_path[1]=end_position;
return true;


}


/**
ЕСЛИ НУЖНО БУДЕТ ИЗ 10 КОРИДОРОВ ВЫБРАТЬ ЛУЧШИЙ, ТО СПЕРВА СМЕЩАЕМ ТЕКУЩИЙ КОРИДОР В НАЧАЛО, ЧТОБЫ НЕ МЕШАЛ И ДАЛЬШЕ РАСЧИТЫВАЕМ С 1 ПО 10 БУФЕР
if(agent.path_corridor_buffer_index!==1){
const temp=corridor_buffers[0];
corridor_buffers[0]=corridor_buffers[agent.path_corridor_buffer_index];
corridor_buffers[agent.path_corridor_buffer_index]=temp;
agent.corridor=corridor_buffers[0];
agent.path_corridor_buffer_index=1;
}
**/


// КОРИДОР
let desired_corridor=agent.corridor_buffers[agent.path_corridor_buffer_index];
let corridor_result=astar.search(desired_corridor,node_start,node_end,start_position,end_position);


// КОРИДОР НЕ НАЙДЕН
if(!corridor_result){
return false;
}


// ПУТЬ
let desired_path=agent.path_buffers[agent.path_corridor_buffer_index];
channel.string_pull(desired_corridor,start_position,end_position,desired_path);


// ЕСЛИ РЕЗУЛЬТАТ УСТРАИВАЕТ, ТО МЕНЯЕМ БУФЕР
agent.path_corridor_buffer_index=(agent.path_corridor_buffer_index+1)%11;
agent.corridor=desired_corridor;
agent.path=desired_path;


return true;


/*
agent_path=agent.path;
agent_path.length=desired_corridor.length+1;
for(let n=0;n<desired_corridor.length;n++){
agent_path[n+1]=desired_corridor[n].centroid;
}
agent_path[agent_path.length]=end_position;
return true;
*/


}


}


// ____________________ clamp_step ____________________
 
 
// ОГРАНИЧИВАЕТ ШАГ В ПРЕДЕЛАХ НАВИГАЦИОННОЙ СЕТКИ, ЧТОБЫ НЕ ВЫПАСТЬ, НАПРИМЕР, ИГРОКУ
// А ЕСЛИ БОТУ НАДО ДОЙТИ ДО ИГРОКА, КОТОРЫЙ НА ДРУГОЙ СТОРОНЕ ПРОПАСТИ, ТО ДОХОДИТ ДО КРАЯ И СМОТРИТ НА ИГРОКА
// nodeLimit-СКОЛЬКО МАКСИМУМ УЗЛОВ ПРОВЕРЯТЬ. ЕСЛИ МАЛО, ТО ПРАКТИЧЕСКИ НЕ ДОЙДЁТ ДО ЦЕЛИ, ЧТО ТОЖЕ МОЖЕТ ПРИГОДИТЬСЯ, НАПРИМЕР, ДЛЯ ШАГА ИГРОКА БЕЗ ПАДЕНИЯ В ПРОПАСТЬ
 
 
// ОПРЕДЕЛЯЕМ ПЕРЕМЕННЫЕ ВНУТРИ ПРОТОТИПА ДЛЯ БЫСТРОГО ДОСТУПА, Т.Е. СКОРОСТИ В ЦИКЛЕ, А НЕ СНАРУЖИ ПЕРЕД КЛАССОМ, ЧТО ЗАМЕДЛИТ, Т.К. ДОПОНИТЕЛЬНО СМОТРИТ ОБЛАСТЬ ВИДИМОСТИ ПЕРЕМЕННОЙ


pathfinding.prototype.clamp_step_visited_flags=new Uint32Array(100000);
pathfinding.prototype.clamp_step_node_depths=new Uint16Array(100000);
pathfinding.prototype.clamp_step_session_counter=0;
pathfinding.prototype.clamp_step_node_queue=[]; 
 
 
pathfinding.prototype.clamp_step=function(start_node,end_position,result_position,nodeLimit=200){


const visitedFlags=this.clamp_step_visited_flags;
const nodeDepths=this.clamp_step_node_depths;
const nodeQueue=this.clamp_step_node_queue;


// ИНИЦИАЛИЗАЦИЯ УНИКАЛЬНОЙ СЕССИИ ДЛЯ ФЛАГОВ ПОСЕЩЕНИЯ. 
// ВМЕСТО ОЧИСТКИ ВСЕГО МАССИВА,МЫ ПРОСТО ПРОВЕРЯЕМ, РАВЕН ЛИ ФЛАГ ТЕКУЩЕМУ SESSIONCOUNTER.
if(++this.clamp_step_session_counter===0xFFFFFFFF){
this.clamp_step_session_counter=1;
visitedFlags.fill(0);
}
const sessionCounter=this.clamp_step_session_counter;


let head=0;
nodeQueue[0]=start_node;
let queueLength=1;


visitedFlags[start_node.id]=sessionCounter;
nodeDepths[start_node.id]=0;


let closest_node=undefined;
let closestX=0,closestY=0,closestZ=0;
let closest_distance=Infinity;


//plane.projectPoint;
const distance_to_plane=start_node.nx*end_position.x+start_node.ny*end_position.y+start_node.nz*end_position.z+start_node.plane_constant;


const epx=end_position.x-start_node.nx*distance_to_plane;
const epy=end_position.y-start_node.ny*distance_to_plane;
const epz=end_position.z-start_node.nz*distance_to_plane;


let cpx=0,cpy=0,cpz=0;


while(head<queueLength){


const currentNode=nodeQueue[head++];


//triangle.closestPointToPoint;


const a=currentNode.vertex_a;
const ax=a.x,ay=a.y,az=a.z;


// ЧИТАЕМ ПРЕДРАССЧИТАННЫЕ ВЕКТОРЫ РЁБЕР ИЗ ПОЛИГОНА (Минус 6 операций!)
const abx=currentNode.abx,aby=currentNode.aby,abz=currentNode.abz;
const acx=currentNode.acx,acy=currentNode.acy,acz=currentNode.acz;

// Вектор от вершины A до проецируемой точки считается в рантайме
const apx=epx-ax,apy=epy-ay,apz=epz-az;

const d1=abx*apx+aby*apy+abz*apz;
const d2=acx*apx+acy*apy+acz*apz;

if(d1<=0 && d2<=0){
cpx=ax; cpy=ay; cpz=az;
}
else{
// bpx/bpy/bpz считаются через предрасчитанный вектор AB: bpx=epx-bx => epx-(ax+abx) => apx-abx
const bpx=apx-abx,bpy=apy-aby,bpz=apz-abz;
const d3=abx*bpx+aby*bpy+abz*bpz;
const d4=acx*bpx+acy*bpy+acz*bpz;
if(d3>=0 && d4<=d3){
cpx=ax+abx; cpy=ay+aby; cpz=az+abz; // Используем смещение от A
}
else{
const vc_code=d1*d4-d3*d2;
if(vc_code<=0 && d1>=0 && d3<=0){
const v=d1/(d1-d3);
cpx=ax+v*abx; cpy=ay+v*aby; cpz=az+v*abz;
}
else{
// cpx2 считаются через предрасчитанный вектор AC: cpx2=apx-acx
const cpx2=apx-acx,cpy2=apy-acy,cpz2=apz-acz;
const d5=abx*cpx2+aby*cpy2+abz*cpz2;
const d6=acx*cpx2+acy*cpy2+acz*cpz2;
if(d6>=0 && d5<=d6){
cpx=ax+acx; cpy=ay+acy; cpz=az+acz;
}
else{
const vb_code=d5*d1-d2*d6;
if(vb_code<=0 && d2>=0 && d6<=0){
const w=d2/(d2-d6);
cpx=ax+w*acx; cpy=ay+w*acy; cpz=az+w*acz;
}
else{
const va_code=d3*d6-d5*d4;
if(va_code<=0 && (d4-d3)>=0 && (d5-d6)>=0){
const w=(d4-d3)/((d4-d3)+(d5-d6));
// Вектор BC это (AC-AB)
const bcx=acx-abx,bcy=acy-aby,bcz=acz-abz;
cpx=ax+abx+w*bcx; 
cpy=ay+aby+w*bcy; 
cpz=az+abz+w*bcz;
}
else{
const denom=1/(va_code+vb_code+vc_code);
const v=vb_code*denom;
const w=vc_code*denom;
cpx=ax+v*abx+w*acx;
cpy=ay+v*aby+w*acy;
cpz=az+v*abz+w*acz;
}
}
}
}
}
}


//point.distanceToSquared
const dx=cpx-epx;
const dy=cpy-epy;
const dz=cpz-epz;
const measured_distance=dx*dx+dy*dy+dz*dz;


if(measured_distance<closest_distance){
closest_node=currentNode;
closestX=cpx; closestY=cpy; closestZ=cpz;
closest_distance=measured_distance;
}


const depth=nodeDepths[currentNode.id];
if(depth>nodeLimit){ continue; }


const neighbours=currentNode.neighbours;
const maxNeighbours=neighbours.length;
const nextDepth=depth+1;


for(let i=0;i<maxNeighbours;i++){


const neighbourId=neighbours[i];
const neighbour=nodes[neighbourId];
const nid=neighbour.id;


// ПРОВЕРКА ВИЗИТА ПО СЕССИОННОМУ ИДЕНТИФИКАТОРУ
if(visitedFlags[nid]===sessionCounter){ continue; }


nodeQueue[queueLength++]=neighbour;// Инкрементный push без аллокаций
visitedFlags[nid]=sessionCounter;
nodeDepths[nid]=nextDepth;


}


}


result_position.x=closestX;
result_position.y=closestY;
result_position.z=closestZ;


return closest_node;


}


export {pathfinding};