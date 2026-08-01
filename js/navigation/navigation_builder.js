import {BufferAttribute,BufferGeometry} from "three";
import {navigation_grid} from "./navigation_grid.js";


const area_xz_degeneracy=1e-5 // 0.00001 КВ.М. — ЭТО ПОРОГ ДЛЯ ТРЕУГОЛЬНИКОВ-НИТОК (МУСОР)
const plane_length_sq_degeneracy=1e-12; // ПОГРЕШНОСТЬ ДЛЯ ОПРЕДЕЛЕНИЯ ВЫРОЖДЕННОСТИ ТРЕУГОЛЬНИКА (МУСОР)


class navigation_builder {


// ____________________ build_zone ____________________


/**
geometry-ГЕОМЕТРИЯ ДЛЯ НАВИГАЦИИ
tolerance-ПОГРЕШНОСТЬ РАССТОЯНИЯ МЕЖДУ ВЕРШИНАМИ, КОТОРОЙ МОЖНО ПРЕНЕБРЕЧЬ И ОБЪЕДИНИТЬ ВЕРШИНЫ.
precision-ДО СКОЛЬКИ ЗНАКОВ ОКРУГЛЯТЬ ВЕРШИНЫ НАВИГАЦИОННОЙ СЕТКИ. ОТ 2 ДО 8. ОБЫЧНО ДОСТАТОЧНО 2, Т.Е. ДО САНТИМЕТРОВ.
max_slope_deviaton_dot-НА СКОЛЬКО СИЛЬНО ДОЛЖНЫ БЫТЬ ТРЕУГОЛЬНИКИ В ОДНОЙ ПЛОСКОСТИ, ЧТОБЫ ОБЪЕДИНИТЬ ИХ В ВЫПУКЛЫЙ МНОГОУГОЛЬНИК. МОЖНО: 1.0, 0.999, 0.99.
1.0-АБСОЛЮТНО ОДИНАКОВАЯ ПЛОСКОСТЬ, ПОДХОДИТ ТОЛЬКО ДЛЯ ПОЛА, А НАКЛОНЁННЫЕ НЕ ОБЪЕДИНЯЕТ.
0.999-ЗДЕСЬ УЖЕ НАКЛОНЁННЫЕ ОБЪЕДИНЯЕТ
0.99-ЧУТЬ БОЛЬШЕ ОБЪЕДИНЯЕТ, ПРОЦЕНТОВ НА 5, ПОЭТОМУ ЛУЧШЕ 0.999
ЕСЛИ СТАВИТЬ МЕНЬШЕ 0.99, ТО ПОЯВЯТСЯ ДЫРЫ
**/


static build_zone(options){


let {zone_name,geometry,tolerance,precision,max_slope_deviaton_dot,navigation_grid_padding_xz,navigation_grid_padding_y,navigation_grid_cells_size_xz,navigation_grid_cells_size_y}=options;


/** НАЧАЛО NAVIGATION MESH **/


// ОБЪЕДИНЯЕМ ТРЕУГОЛЬНИКИ ГЕОМЕТРИИ
geometry=this.merge_vertices(geometry,tolerance);


// СТАВИМ ТРЕУГОЛЬНИКИ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ, ЧТОБЫ НЕ ЛОМАЛИСЬ ВЫЧИСЛЕНИЯ В ДРУГИХ ФУНКЦИЯХ
this.set_counter_clockwise(geometry);


// СОБИРАЕМ ТРЕУГОЛЬНИКИ И ВЕРШИНЫ
let navigation_mesh=this.build_triangles_from_geometry(geometry);
let nodes=navigation_mesh.triangles;
let vertices=navigation_mesh.vertices;


// ДОБАВЛЯМ СОСЕДЕЙ
this.build_neighbours_for_triangles(navigation_mesh);


// ОКРУГЛЯЕМ КООРДИНАТЫ
let item=vertices;
let factor=Math.pow(10,precision);
for(let n=0;n<item.length;n++){
let v=item[n];
//v.x=Math.round(v.x*factor)/factor;
//v.y=Math.round(v.y*factor)/factor;
//v.z=Math.round(v.z*factor)/factor;
}


for(let n=0;n<nodes.length;n++){
	
	
let triangle=nodes[n];
triangle.neighbours=Array.from(triangle.neighbours);
let neighbours_indices=triangle.neighbours;


/** ДЕЛАЕМ ПОРТАЛЫ К СОСЕДЯМ **/


// 1. ИНИЦИАЛИЗИРУЕМ ДВА ПЛОСКИХ МАССИВА ПОД ДЛИНУ SET СОСЕДЕЙ ТРЕУГОЛЬНИКА
const neighbour_count=neighbours_indices.length;
const portal_v0=new Array(neighbour_count);
const portal_v1=new Array(neighbour_count);


// ААА-РАЗГОН ДЛЯ ASTAR: НОВЫЕ ПЛОСКИЕ МАССИВЫ ДЛЯ ДЕЛЬТ И КВАДРАТОВ ДЛИН РЕБЕР-ПОРТАЛОВ
const portal_dx=new Float64Array(neighbour_count);
const portal_dz=new Float64Array(neighbour_count);
const portal_len_2d=new Float64Array(neighbour_count);
const portal_inv_len_2d=new Float64Array(neighbour_count);


// 2. БЫСТРЫЙ ЦИКЛ ПЕРЕБОРА СОСЕДЕЙ


for(let neighbour_index=0;neighbour_index<neighbour_count;neighbour_index++){
const neighbour_node=nodes[neighbours_indices[neighbour_index]];
this.bake_shared_vertices_in_order_for_portals(triangle,neighbour_node,neighbour_index,vertices,portal_v0,portal_v1,portal_dx,portal_dz,portal_len_2d,portal_inv_len_2d);
}


let pv=triangle.vertex_ids;


const a=vertices[pv[0]];
const b=vertices[pv[1]];
const c=vertices[pv[2]];


let ax=a.x,ay=a.y,az=a.z;
let bx=b.x,by=b.y,bz=b.z;
let cx=c.x,cy=c.y,cz=c.z;


/** ЦЕНТРОИД **/
let centroid_scalar=1/3;
let centroid={x:(ax+bx+cx)*centroid_scalar,y:(ay+by+cy)*centroid_scalar,z:(az+bz+cz)*centroid_scalar};


/** ЗАРАНЕЕ РАСЧИТЫВАЕМ ВЕКТОРА РЁБЕР **/
let abx=bx-ax;
let aby=by-ay;
let abz=bz-az;


let acx=cx-ax;
let acy=cy-ay;
let acz=cz-az;


let bcx=cx-bx;
let bcy=cy-by;
let bcz=cz-bz;


let cax=-acx;
let cay=-acy;
let caz=-acz;


/** ЗАРАНЕЕ РАСЧИТЫВАЕМ ПЛОСКОСТЬ И ОТСЕИВАЕМ ОШИБОЧНЫЕ (plane.setFromCoplanarPoints) **/
let nx=bcy*(-abz)-bcz*(-aby);
let ny=bcz*(-abx)-bcx*(-abz);
let nz=bcx*(-aby)-bcy*(-abx);
const plane_length_sq=nx*nx+ny*ny+nz*nz;


// ЗАЩИТА ОТ "ИГОЛОК" И ВЕРТИКАЛЬНОГО МУСОРА НА ВИДЕ СВЕРХУ (XZ)
const area_xz=Math.abs(abx*acz-acx*abz);


if(area_xz<area_xz_degeneracy){
console.log("ОШИБКА. ВЫРОЖДЕННЫЙ ТРЕУГОЛЬНИК area_xz="+area_xz+" НА УЗЛЕ "+triangle.id);
}


/** ПОРОГ 1E-8 ОТСЕЧЁТ ОШИБОЧНЫЕ ТРЕУГОЛЬНИКИ, КОТОРЫЕ ПОТОМ МОГУТ ВЫЗВАТЬ ПРОБЛЕМЫ В РАСЧЁТАХ **/
if(plane_length_sq>plane_length_sq_degeneracy){
const invLen=1/Math.sqrt(plane_length_sq);
nx*=invLen;
ny*=invLen;
nz*=invLen;
}
else{
console.log("ОШИБКА. ВЫРОЖДЕННЫЙ ТРЕУГОЛЬНИК plane_length_sq="+plane_length_sq+" НА УЗЛЕ "+triangle.id);
}


let plane_constant=-(ax*nx+ay*ny+az*nz);


/** КВАДРАТЫ ДЛИНЫ РЕБЁР ТРЕУГОЛЬНИКА В 2D-ПРОЕКЦИИ (XZ). **/
let ab_length_sq_xz=abx*abx+abz*abz;
let bc_length_sq_xz=bcx*bcx+bcz*bcz;
let ca_length_sq_xz=cax*cax+caz*caz;


let ab_length_xz=Math.sqrt(ab_length_sq_xz);
let inv_ab_length_xz=ab_length_xz!==0?1/ab_length_xz:0;
let inv_ab_length_sq_xz=ab_length_sq_xz!==0?1/ab_length_sq_xz:0;


/** СОЗДАЁМ СВОЙСТВА ТРЕУГОЛЬНИКА **/
nodes[n]={
id:triangle.id,
group_id:-1,
cost:1,
neighbours:triangle.neighbours,
neighbour_0:triangle.neighbour_0,
neighbour_1:triangle.neighbour_1,
neighbour_2:triangle.neighbour_2,
vertex_ids:triangle.vertex_ids,
vertex_a:a,
vertex_b:b,
vertex_c:c,
centroid:centroid,
centroid_x:centroid.x,
centroid_y:centroid.y,
centroid_z:centroid.z,
// ЗДЕСЬ ИСПОЛЬЗУЕМ TRUE ИЛИ FALSE ВМЕСТО МАСОК, Т.К. У НАС ЗНАЧЕНИЯ СТАТИЧНЫ И НА СКОРОСТЬ НЕ ПОВЛИЯЮТ
ab_is_abyss:triangle.ab_is_abyss,
bc_is_abyss:triangle.bc_is_abyss,
ca_is_abyss:triangle.ca_is_abyss,
f:0,
g:0,
entry_x:0,
entry_y:0,
entry_z:0,
visited:0, // ИСПОЛЬЗУЕМ БИТОВУЮ МАСКУ ВМЕСТО FALSE
closed:0, // ИСПОЛЬЗУЕМ БИТОВУЮ МАСКУ ВМЕСТО FALSE
parent:-1,
portal_v0:portal_v0,
portal_v1:portal_v1,
portal_dx:portal_dx, // Запеченные дельты по X
portal_dz:portal_dz, // Запеченные дельты по Z
portal_len_2d:portal_len_2d, // Запеченные квадраты 2D длин ребер (lengthSqXZ)
portal_inv_len_2d:portal_inv_len_2d, // Запеченные инверсии длин (1/lengthSqXZ)
ab_length_sq_xz:ab_length_sq_xz,
bc_length_sq_xz:bc_length_sq_xz,
ca_length_sq_xz:ca_length_sq_xz,
ab_length_xz:ab_length_xz,
inv_ab_length_xz:inv_ab_length_xz,
inv_ab_length_sq_xz:inv_ab_length_sq_xz,
// ОБХОДИМ ДЕЛЕНИЕ НА НОЛЬ
inv_ab_length_sq_xz:ab_length_sq_xz===0?0:1/ab_length_sq_xz,
inv_bc_length_sq_xz:bc_length_sq_xz===0?0:1/bc_length_sq_xz,
inv_ca_length_sq_xz:ca_length_sq_xz===0?0:1/ca_length_sq_xz,
// ДАННЫЕ ПЛОСКОСТИ
nx:nx,
ny:ny,
// ОБХОДИМ ДЕЛЕНИЕ НА НОЛЬ
inv_ny:ny!==0?1/ny:0,
nz:nz,
nxnx:nx*nx,
nyny:ny*ny,
nznz:nz*nz,
abs_nx:Math.abs(nx),
abs_ny:Math.abs(ny),
abs_nz:Math.abs(nz),
plane_constant:plane_constant,
ax:ax,ay:ay,az:az,
bx:bx,by:by,bz:bz,
cx:cx,cy:cy,cz:cz,
abx:abx,
aby:aby,
abz:abz,
acx:acx,
acy:acy,
acz:acz,
bcx:bcx,
bcz:bcz,
cax:cax,
caz:caz
};


}


/** СОЗДАЁМ ВЫПУКЛЫЕ МНОГОУГОЛЬНИКИ **/


// ОБЪЕДИНЯЕМ ТРЕУГОЛЬНИКИ В ВЫПУКЛЫЕ МНОГОУГОЛЬНИКИ
let convex_polygons=this.merge_triangles_to_convex_polygons(nodes,max_slope_deviaton_dot);
// ДОБАВЛЯЕМ ИМ СОСЕДЕЙ
convex_polygons=this.build_neighbours_for_convex_polygons(convex_polygons,nodes);
// ДОБАВЛЯЕМ ИМ ЦЕНТРОИДЫ
convex_polygons=this.build_centroids_for_convex_polygons(convex_polygons);


/** СОБИРАЕМ ЗОНУ **/

let pre_navigation_grid=new navigation_grid();
pre_navigation_grid.build(nodes,vertices,navigation_grid_padding_xz,navigation_grid_padding_y,navigation_grid_cells_size_xz,navigation_grid_cells_size_y);


const zone={
nodes:nodes,
vertices:vertices,
groups:this.build_triangles_groups(nodes), // ДОБАВЛЯЕМ ОСТРОВКИ ТРЕУГОЛЬНИКОВ В ГРУППЫ
nodes_2:convex_polygons,
navigation_grid:pre_navigation_grid
};


return zone;


}


// ____________________ build_triangles_groups ____________________


static build_triangles_groups(nodes){


const triangle_groups=[];


for(let n=0;n<nodes.length;n++){
	
	
let triangle=nodes[n];


// ТРЕУГОЛЬНИК ПРИНАДЛЕЖИТ ГРУППЕ
if(triangle.group_id!==-1){
triangle_groups[triangle.group_id].push(triangle.id);
}
// СОЗДАНИЕ НОВОЙ ГРУППЫ С ЭТИМ ТРЕУГОЛЬНИКОМ И НАЗНАЧЕНИЕ ID ГРУППЫ ЕГО СОСЕДЯМ
else{
triangle.group_id=triangle_groups.length;
this.spread_group_id(triangle,nodes);
triangle_groups.push([triangle.id]);
}


}


return triangle_groups;


}


// ____________________ spread_group_id ____________________


static spread_group_id(seed,nodes){


let nextBatch=new Set([seed]);


while(nextBatch.size>0){


const batch=nextBatch;
nextBatch=new Set();
batch.forEach((triangle)=>{
triangle.group_id=seed.group_id;
triangle.neighbours.forEach((neighbour_id,n)=>{
if(nodes[neighbour_id].group_id===-1){
nextBatch.add(nodes[neighbour_id]);
}
});
});


}


}


// ____________________ build_triangles_from_geometry ____________________


static build_triangles_from_geometry(geometry){


const position=geometry.attributes.position;
const position_array=position.array;
const index=geometry.index.array;


const triangles=[];
triangles.length=geometry.index.count/3;


let max_position=position.count;
const vertices=[];
vertices.length=max_position;


const vertex_triangle_map=[];
vertex_triangle_map.length=max_position;


for(let i=0;i<max_position;i++){
let n=i*3;
vertices[i]={x:position_array[n],y:position_array[n+1],z:position_array[n+2]};
}


for(let n=0,triangle_id=0,max=geometry.index.count;n<max;n+=3,triangle_id++){


const a=index[n];
const b=index[n+1];
const c=index[n+2];


triangles[triangle_id]={
id:triangle_id,
vertex_ids:[a,b,c],
neighbours:[]
};


}


return {triangles:triangles,vertices:vertices};


}


// ____________________ build_neighbours_for_triangles ____________________


static build_neighbours_for_triangles(navigation_mesh){


let nodes=navigation_mesh.triangles;
let vertices=navigation_mesh.vertices;
	
	
// СОЗДАЁМ КАРТУ ВЕРШИН И ЗАПОЛНЯЕМ МАССИВОВМ, НО НЕ ЧЕРЕЗ fill([]) ИНАЧЕ БУДЕТ ССЫЛКА ТОЛЬКО НА ОДИН МАССИВ
const vertex_triangle_map=new Array(vertices.length);
for(let n=0;n<vertex_triangle_map.length;n++){
vertex_triangle_map[n]=[];
}


// ПРИВЯЗЫВАЕМ УЗЛЫ К ВЕРШИНАМ
for(let n=0;n<nodes.length;n++){
let node=nodes[n];
let vertex_ids=node.vertex_ids;
vertex_triangle_map[vertex_ids[0]].push(node);
vertex_triangle_map[vertex_ids[1]].push(node);
vertex_triangle_map[vertex_ids[2]].push(node);
}


// ДОБАВЛЯМ СОСЕДЕЙ
for(let n=0;n<nodes.length;n++){
nodes[n].neighbours=this.build_neighbours_for_triangles_final(nodes[n],vertex_triangle_map);
}


}

// ____________________ build_neighbours_for_triangles_final ____________________


/** ДОСТАТОЧНО ПЕРЕБРАТЬ ТОЛЬКО ГРУППЫ A И B. ТРЕУГОЛЬНИКИ, КОТОРЫЕ ЕСТЬ ТОЛЬКО В ГРУППЕ C, ФИЗИЧЕСКИ НЕ МОГУТ ИМЕТЬ БОЛЬШЕ 1 ОБЩЕЙ ВЕРШИНЫ С ТЕКУЩИМ. **/


static build_neighbours_for_triangles_final(triangle,vertex_triangle_map){
	
	
const [v0,v1,v2]=triangle.vertex_ids;
const neighbours=new Set();


const groupA=vertex_triangle_map[v0];
const groupB=vertex_triangle_map[v1];
const groupC=vertex_triangle_map[v2];


const setB=new Set(groupB);
const setC=new Set(groupC);


// ИЗНАЧАЛЬНО СЧИТАЕМ, ЧТО ВСЕ ТРИ РЕБРА — ЭТО ПРОПАСТИ.
// ЕСЛИ В ЦИКЛАХ НИЖЕ НАЙДЕТСЯ ХОТЬ ОДИН СОСЕД ДЛЯ РЕБРА, ФЛАГ СТАНЕТ FALSE.
let ab_is_abyss=true;
let bc_is_abyss=true;
let ca_is_abyss=true;
	

// ИЗНАЧАЛЬНО СОСЕДЕЙ ДЛЯ КОНКРЕТНЫХ РЁБЕР НЕТ
let neighbour_0=-1; // Ребро AB (v0 -> v1)
let neighbour_1=-1; // Ребро BC (v1 -> v2)
let neighbour_2=-1; // Ребро CA (v2 -> v0)
	
	
// Проверяем группу А
for(let i=0;i<groupA.length;i++){
const candidate=groupA[i];
if(candidate===triangle){ continue; }
const in_B=setB.has(candidate);
const in_C=setC.has(candidate);
if(in_B || in_C){
neighbours.add(candidate.id);
// ЕСЛИ КАНДИДАТ ЕСТЬ В B, ЗНАЧИТ ОН ДЕЛИТ v0 И v1 -> РЕБРО AB ОБИТАЕМО
if(in_B){ ab_is_abyss=false; neighbour_0=candidate.id; }
// ЕСЛИ КАНДИДАТ ЕСТЬ В C, ЗНАЧИТ ОН ДЕЛИТ v0 и v2 -> РЕБРО CA ОБИТАЕМО
if(in_C){ ca_is_abyss=false; neighbour_2=candidate.id;}
}
}


// Проверяем группу B
for(let j=0;j<groupB.length;j++){
const candidate=groupB[j];
if(candidate===triangle){ continue; }
if(setC.has(candidate)){
neighbours.add(candidate.id);
// ЕСЛИ КАНДИДАТ ЕСТЬ В C, ЗНАЧИТ ОН ДЕЛИТ v1 и v2 -> РЕБРО BC ОБИТАЕМО
bc_is_abyss=false;
neighbour_1=candidate.id;
}
}


triangle.ab_is_abyss=ab_is_abyss;
triangle.bc_is_abyss=bc_is_abyss;
triangle.ca_is_abyss=ca_is_abyss;
	

triangle.neighbour_0=neighbour_0;
triangle.neighbour_1=neighbour_1;
triangle.neighbour_2=neighbour_2;
	
	
return neighbours;


}


// ____________________ bake_shared_vertices_in_order_for_portals ____________________


static bake_shared_vertices_in_order_for_portals(triangle,neighbour_node,neighbour_index,vertices,portal_v0,portal_v1,portal_dx,portal_dz,portal_len_2d,portal_inv_len_2d){


const aList=triangle.vertex_ids;
const a0=aList[0],a1=aList[1],a2=aList[2];


const bList=neighbour_node.vertex_ids;
const b0=bList[0],b1=bList[1],b2=bList[2];


const shared0=(a0===b0 || a0===b1 || a0===b2);
const shared1=(a1===b0 || a1===b1 || a1===b2);
const shared2=(a2===b0 || a2===b1 || a2===b2);


let v0_id=null;
let v1_id=null;


// Строгий CW-обход (По часовой стрелке) для сохранения знаков воронки
if(shared0 && shared1){
v0_id=a0; v1_id=a1; // Ребро AB
}
else if(shared1 && shared2){
v0_id=a1; v1_id=a2; // Ребро BC
}
else if(shared0 && shared2){
v0_id=a2; v1_id=a0; // Ребро CA
}
else if(shared0 && shared1 && shared2){
v0_id=a0; v1_id=a1;
}


if(v0_id!==null && v1_id!==null){
	
	
// ИЗВЛЕКАЕМ ГЕОМЕТРИЮ ТОЧЕК И ВЫЧИСЛЯЕМ ПАРАМЕТРЫ РЕБРА НА ЭТАПЕ БЕЙКА
const p1=vertices[v0_id];
const p2=vertices[v1_id];


const dx=p2.x-p1.x;
const dz=p2.z-p1.z;
const lenSq=dx*dx+dz*dz;


// ЗАПИСЫВАЕМ ГЕОМЕТРИЮ В ПЛОСКИЕ БУФЕРЫ
portal_v0[neighbour_index]=p1;
portal_v1[neighbour_index]=p2;
portal_dx[neighbour_index]=dx;
portal_dz[neighbour_index]=dz;
portal_len_2d[neighbour_index]=lenSq;
portal_inv_len_2d[neighbour_index]=lenSq===0?0:1/lenSq; // ПРЕВРАЩАЕМ ДЕЛЕНИЕ В УМНОЖЕНИЕ
}
else{
portal_v0[neighbour_index]=null;
portal_v1[neighbour_index]=null;
portal_dx[neighbour_index]=0;
portal_dz[neighbour_index]=0;
portal_len_2d[neighbour_index]=0;
portal_inv_len_2d[neighbour_index]=0;
}


}


// ____________________ set_counter_clockwise ____________________


static set_counter_clockwise(geometry){
	
	
const indices=geometry.getIndex();
const positions=geometry.getAttribute('position');


if(!indices){ 
alert("set_counter_clockwise: no indices"); 
return;
}


const array=indices.array; 
const count=indices.count;


for(let i=0;i<count;i+=3){
	
	
const idx1=array[i];
const idx2=array[i+1];
const idx3=array[i+2];


const p1x=positions.getX(idx1),p1z=positions.getZ(idx1);
const p2x=positions.getX(idx2),p2z=positions.getZ(idx2);
const p3x=positions.getX(idx3),p3z=positions.getZ(idx3);


const winding=(p2x-p1x)*(p3z-p1z)-(p2z-p1z)*(p3x-p1x);


// ЕСЛИ ТРЕУГОЛЬНИК ПО ЧАСОВОЙ СТРЕЛКЕ (winding>0), ТО МЫ МЕНЯЕМ МЕСТАМИ ИНДЕКСЫ, ЧТОБЫ РАЗВЕРНУТЬ ЕГО ПРОТИВ ЧАСОВОЙ (CCW)
if(winding>0){
array[i+1]=idx3;
array[i+2]=idx2;
}


}


indices.needsUpdate=true;


}


// ____________________ merge_vertices ____________________

/**
ОПТИМИЗИРОВАТЬ НЕКУДА. getX, getY, getZ УЧИТЫВАЕТ ИНДЕКС ГЕОМЕТРИИ.
ЗДЕСЬ ВМЕСТО ~~ И ROUND, ИСПОЛЬЗУЕМ FLOOR, ЧТОБЫ НЕ БЫЛО НЕДОЧЁТОВ
tolerance-ПОГРЕШНОСТЬ. ИСПОЛЬЗУЕМ ТОЛЬКО ЕДИНИЦЫ ТИПА: 0.001, 0.0001 И Т.Д.
НЕ МЕНЯТЬ! СТРОКОВЫЙ ХЕШ "${ix},${iy},${iz}" ГАРАНТИРУЕТ 100% УНИКАЛЬНОСТЬ КЛЮЧА.
**/


static merge_vertices(geometry, tolerance=1e-4){
	
	
tolerance=Math.max(tolerance,Number.EPSILON);


const indices=geometry.getIndex();
const positions=geometry.getAttribute("position");
if(!positions){ alert("merge_vertices: no positions"); return geometry; }


const vertexCount=indices?indices.count:positions.count;
const shiftMultiplier=1/tolerance;
// БУФЕРЫ ДЛЯ ПЕРЕМАППИНГА И СОХРАНЕНИЯ ОРИГИНАЛЬНЫХ ИНДЕКСОВ ВЕРШИН
const tempRemap=new Uint32Array(vertexCount);
const tempOrigIndices=new Uint32Array(vertexCount);


const hashToIndex={};
let uniqueVertexCounter=0;


// ЭТАП 1: ПРЕДВАРИТЕЛЬНЫЙ РАСЧЕТ УНИКАЛЬНОСТИ ВЕРШИН ПО СЕТКЕ MATH.FLOOR
for(let i=0;i<vertexCount;i++){


const index=indices?indices.getX(i):i;
tempOrigIndices[i]=index;


const vx=positions.getX(index);
const vy=positions.getY(index);
const vz=positions.getZ(index);


const ix=Math.floor(vx*shiftMultiplier);
const iy=Math.floor(vy*shiftMultiplier);
const iz=Math.floor(vz*shiftMultiplier);


const hash=`${ix},${iy},${iz},`;
const existingIndex=hashToIndex[hash];


if(existingIndex!==undefined){
tempRemap[i]=existingIndex;
}
else {
hashToIndex[hash]=uniqueVertexCounter;
tempRemap[i]=uniqueVertexCounter;
uniqueVertexCounter++;
}


}


// БУФЕРЫ ДЛЯ ФИНАЛЬНОЙ СБОРКИ (ZERO-ALLOCATION В РАНТАЙМЕ)
const finalPositions=new Float32Array(uniqueVertexCounter*3);
const finalIndices=new Uint32Array(vertexCount);


// КАРТА ПЕРЕЛИНКОВКИ ФИНАЛЬНЫХ ПЛОТНЫХ ИНДЕКСОВ
const finalVertexMap=new Int32Array(uniqueVertexCounter);
for(let i=0;i<uniqueVertexCounter;i++) finalVertexMap[i]=-1;


let nextIndex=0;
let valid_index_count=0;


// ЭТАП 2: СКАНИРУЮЩИЙ КОНВЕЙЕР
for(let i=0;i<vertexCount;i+=3){
const id0=tempRemap[i];
const id1=tempRemap[i+1];
const id2=tempRemap[i+2];


// ПУЛЕНЕПРОБИВАЕМЫЙ ОТСЕВ ВЫРОЖДЕННЫХ ТРЕУГОЛЬНИКОВ НА ЛЕТУ
if(id0!==id1 && id1!==id2 && id0!==id2){

 
for(let v=0;v<3;v++){
	
	
const curId=tempRemap[i+v];
let finalId=finalVertexMap[curId];


if(finalId === -1){
const origIdx=tempOrigIndices[i+v];
const pIdx=nextIndex*3;


finalPositions[pIdx]=positions.getX(origIdx);
finalPositions[pIdx+1]=positions.getY(origIdx);
finalPositions[pIdx+2]=positions.getZ(origIdx);


finalId=nextIndex;
finalVertexMap[curId]=nextIndex++;
}


finalIndices[valid_index_count++]=finalId;


}


}


}


if(valid_index_count<3){ return geometry; }


const packedPositions=finalPositions.slice(0,nextIndex*3);
const packedIndices=finalIndices.slice(0,valid_index_count);


const result=new BufferGeometry();
result.setAttribute("position",new BufferAttribute(packedPositions,3));
result.setIndex(new BufferAttribute(packedIndices,1));


return result;


}


// ____________________ try_merge_triangles_to_convex_polygons ____________________


static tmttcp_merge_buffer=new Array(64);


static try_merge_triangles_to_convex_polygons(polyA, polyB, max_slope_deviaton_dot){
	
	
const epsilon=1e-8; // ЛУЧШЕ СТАВИТЬ МЕНЬШЕ. ИНАЧЕ НА МАЛЫХ МАСШТАБАХ МОЖЕТ ДЕЛАТЬ ДЫРЫ
const vA=polyA.vertices,vB=polyB.vertices;
const lenA=vA.length,lenB=vB.length;


// ШАГ 0: Быстрый контроль плоскостей по готовым нормалям
if(Math.abs(polyA.normal.x*polyB.normal.x+polyA.normal.y*polyB.normal.y+polyA.normal.z*polyB.normal.z)<max_slope_deviaton_dot){
return null; 
}


let edgeA=-1,edgeB=-1;


// ШАГ 1: Поиск общего ребра
for(let i=0;i<lenA;i++){
const nextA=(i === lenA-1) ? 0 :i+1;
for(let j=0;j<lenB;j++){
const nextB=(j === lenB-1) ? 0 :j+1;


if(Math.abs(vA[i].x-vB[nextB].x)<epsilon && Math.abs(vA[i].y-vB[nextB].y)<epsilon && Math.abs(vA[i].z-vB[nextB].z)<epsilon &&
Math.abs(vA[nextA].x-vB[j].x)<epsilon && Math.abs(vA[nextA].y-vB[j].y)<epsilon && Math.abs(vA[nextA].z-vB[j].z)<epsilon){
edgeA=i; edgeB=j;
break;
}
}
if(edgeA!==-1) break;
}


if(edgeA === -1) return null;


// ШАГ 2: СБОРКА ИСХОДНОГО КОНТУРА В ПЕРЕИСПОЛЬЗУЕМЫЙ БУФЕР (Zero-Allocation)
const initialLen=lenA+lenB-2;
if(initialLen>this.tmttcp_merge_buffer.length) this.tmttcp_merge_buffer=new Array(initialLen*2);


const buf=this.tmttcp_merge_buffer;
let wIdx=0;


for(let i=0;i <= edgeA;i++) buf[wIdx++]=vA[i];


let idxB=(edgeB === lenB-2) ? 0 :(edgeB === lenB-1) ? 1 :edgeB+2;
for(let c=0;c<lenB-2;c++){
buf[wIdx++]=vB[idxB];
idxB=(idxB === lenB-1) ? 0 :idxB+1;
}
for(let i=edgeA+1;i<lenA;i++) buf[wIdx++]=vA[i];


// ШАГ 3: Выбор осей проекции (0=XZ, 1=YZ, 2=XY)
const absNx=Math.abs(polyA.normal.x), absNy=Math.abs(polyA.normal.y), absNz=Math.abs(polyA.normal.z);
const mode=(absNy >= absNx && absNy >= absNz) ? 0 :(absNx >= absNy && absNx >= absNz) ? 1 :2;


const result=new Array(initialLen);
let finalCount=0;


// =========================================================================
// ШАГ 4: ЧИСТАЯ ЛИНЕЙНАЯ ФИЛЬТРАЦИЯ 180° ПО КОРРЕКТНОМУ ИСХОДНОМУ КОЛЬЦУ
// =========================================================================
for(let i=0;i<initialLen;i++){
const pLeft =buf[i === 0 ? initialLen-1 :i-1];
const pCurr =buf[i];
const pRight=buf[i === initialLen-1 ? 0 :i+1];


let cross=0;
if(mode === 0) cross=(pCurr.x-pLeft.x)*(pRight.z-pLeft.z)-(pRight.x-pLeft.x)*(pCurr.z-pLeft.z);
else if(mode === 1) cross=(pCurr.y-pLeft.y)*(pRight.z-pLeft.z)-(pRight.y-pLeft.y)*(pCurr.z-pLeft.z);
else cross=(pCurr.x-pLeft.x)*(pRight.y-pLeft.y)-(pRight.x-pLeft.x)*(pCurr.y-pLeft.y);

if(Math.abs(cross) >= epsilon){
result[finalCount++]=pCurr;
}
}


if(finalCount<3) return null;


// =========================================================================
// ШАГ 5: ИСПРАВЛЕННЫЙ КОНТРОЛЬ ВЫПУКЛОСТИ (БЕЗ БАГОВ ГРАНИЦ И ШВОВ)
// Проверка идет строго по цепочке выживших точек, исключая ложные null!
// =========================================================================
let expectedSign=0;
for(let i=0;i<finalCount;i++){
const pLeft =result[i === 0 ? finalCount-1 :i-1];
const pCurr =result[i];
const pRight=result[i === finalCount-1 ? 0 :i+1];


let cross=0;
if(mode === 0) cross=(pCurr.x-pLeft.x)*(pRight.z-pLeft.z)-(pRight.x-pLeft.x)*(pCurr.z-pLeft.z);
else if(mode === 1) cross=(pCurr.y-pLeft.y)*(pRight.z-pLeft.z)-(pRight.y-pLeft.y)*(pCurr.z-pLeft.z);
else cross=(pCurr.x-pLeft.x)*(pRight.y-pLeft.y)-(pRight.x-pLeft.x)*(pCurr.y-pLeft.y);


if(Math.abs(cross)>epsilon){
const currentSign=cross>0 ? 1 :-1;
if(expectedSign === 0) expectedSign=currentSign;
else if(currentSign!==expectedSign) return null; 
}
}


// Возвращаем чистый PACKED массив идеального размера без изменения .length динамически
return finalCount === initialLen ? result :result.slice(0, finalCount);


}


// ____________________ merge_triangles_to_convex_polygons ____________________
	

static mttcp_merge_visited=new Int32Array(1024);
static mttcp_merge_temp_buffer=new Int32Array(1024);
// СТАТИЧЕСКИЙ БУФЕР ПОД ОЧЕРЕДЬ, ЧТОБЫ НЕ ВЫДЕЛЯТЬ ПАМЯТЬ В РАНТАЙМЕ (ZERO-ALLOCATION)
static mttcp_queue_buffer=new Int32Array(1024);
// СКВОЗНОЙ ЗАЩИЩЕННЫЙ СЧЕТЧИК ВЫЗОВОВ ДЛЯ СТОПРОЦЕНТНОЙ ИЗОЛЯЦИИ ПРИ СМЕНЕ КАРТ
static _mttcp_call_counter=0;


static merge_triangles_to_convex_polygons(graph,max_slope_deviaton_dot){

	
const totalNodes=graph.length;
let polygons=new Array(totalNodes);


// ИНИЦИАЛИЗАЦИЯ: Копируем геометрию прямыми ссылками
for(let i=0;i<totalNodes;i++){
const node=graph[i];		
node.polygon_id=-1;	
polygons[i]={
id:i,
vertices:[node.vertex_a,node.vertex_b,node.vertex_c],
normal:{ x:node.nx,y:node.ny,z:node.nz },
old_neighbours:node.neighbours ? node.neighbours.slice() :[],
subTriangles:[i]
};
}


// Защита от переполнения статических буферов
if(totalNodes>this.mttcp_merge_visited.length){
this.mttcp_merge_visited=new Int32Array(totalNodes*2);
this.mttcp_merge_temp_buffer=new Int32Array(totalNodes*2);
this.mttcp_queue_buffer=new Int32Array(totalNodes*2);
}


const visited=this.mttcp_merge_visited;
const tempBuffer=this.mttcp_merge_temp_buffer;
const queue=this.mttcp_queue_buffer;


// ОПТИМИЗАЦИЯ СМЕНЫ КАРТ: Побитовое циклическое зацикливание (0-65335)
// Гарантирует, что при перезагрузке уровней старый мусор в visited не сломает новые уникализации!
this._mttcp_call_counter=(this._mttcp_call_counter+1) & 0xFFFF;
const currentCallMarker=this._mttcp_call_counter;
let localMarkerSequence=0;


// --- ИНИЦИАЛИЗАЦИЯ ОЧЕРЕДИ РАБОТЫ ---
// Генерируем уникальный маркер для нахождения элементов в очереди на этом кадре
localMarkerSequence++;
const inQueueKey=localMarkerSequence | (currentCallMarker << 16);


let head=0;
let tail=0;


// В начале работы добавляем абсолютно все полигоны в очередь на проверку
for (let i=0;i < totalNodes;i++){
queue[tail++]=i;
visited[i]=inQueueKey; // Помечаем, что полигон уже в очереди
}


// Основной цикл: пока в очереди есть полигоны, требующие проверки
while (head < tail){
const idxA=queue[head++];
const polyA=polygons[idxA];


// Снимаем маркер нахождения в очереди, так как мы его сейчас обрабатываем
if(polyA) visited[idxA]=0; 
else continue; // Если полигон уже был поглощен кем-то ранее, пропускаем


const neighbourIds=polyA.old_neighbours;
let oldLenA=neighbourIds.length;
let mergedOnThisStep=false;


for (let j=0;j < oldLenA;j++){
const nid=neighbourIds[j];
const polyB=polygons[nid]; 


// Отсев мертвых ссылок
if(!polyB || polyA.id === polyB.id){
neighbourIds[j]=neighbourIds[--oldLenA];
neighbourIds.length=oldLenA;
j--;
continue;
}


// Пытаемся мержить
const mergedVerts=this.try_merge_triangles_to_convex_polygons(polyA,polyB,max_slope_deviaton_dot);
if(mergedVerts!==null){
polyA.vertices=mergedVerts;
polyA.subTriangles.push(...polyB.subTriangles);


// --- СБОР УНИКАЛЬНЫХ СОСЕДЕЙ ---
localMarkerSequence++;
const visitKey=localMarkerSequence | (currentCallMarker << 16);


let count=0;
const idA=polyA.id,idB=polyB.id;


for (let n=0;n < oldLenA;n++){ 
const id=neighbourIds[n];
if(id!==idA && id!==idB && visited[id]!==visitKey){
visited[id]=visitKey;
tempBuffer[count++]=id;
}
}


const nListB=polyB.old_neighbours;
const lenB=nListB.length;
for (let n=0;n < lenB;n++){
const id=nListB[n];
if(id!==idA && id!==idB && visited[id]!==visitKey){
visited[id]=visitKey;
tempBuffer[count++]=id;
}
}


for (let n=0;n < count;n++){
neighbourIds[n]=tempBuffer[n];
}
neighbourIds.length=count;
oldLenA=count;


polygons[idB]=null; // Стираем поглощенный полигон


// --- ПЕРЕЛИНКОВКА СОСЕДЕЙ ---
for (let n=0;n < lenB;n++){
const pK_idx=nListB[n];
const pK=polygons[pK_idx];
if(pK && pK.id!==idA){
const pK_neighbours=pK.old_neighbours;
let pK_len=pK_neighbours.length;
let targetIdx=-1,hasA=false;


for (let m=0;m < pK_len;m++){
if(pK_neighbours[m] === idB) targetIdx=m;
if(pK_neighbours[m] === idA) hasA=true;
}


if(targetIdx!==-1){
if(!hasA){
pK_neighbours[targetIdx]=idA;
} else {
for (let m=targetIdx;m < pK_len-1;m++) pK_neighbours[m]=pK_neighbours[m+1];
pK_neighbours.length=pK_len-1;
}
}


// ВАЖНО: Так как у соседа pK изменились связи (он потерял polyB и получил polyA),
// его геометрия не поменялась, но его обязательно нужно перепроверить в будущем!
// Добавляем его в очередь, если его там еще нет
if(visited[pK_idx]!==inQueueKey){
queue[tail++]=pK_idx;
visited[pK_idx]=inQueueKey;
}
}
}


mergedOnThisStep=true;
break; // Выходим из цикла соседей, так как polyA изменился
}
}


if(neighbourIds.length!==oldLenA) neighbourIds.length=oldLenA;

// Если polyA успешно объединился с кем-то, его структура (размер, соседи) поменялась!
// Его нужно вернуть в очередь, чтобы он попробовал найти новые мёржи с обновленными соседями
if(mergedOnThisStep && visited[idxA]!==inQueueKey){
queue[tail++]=idxA;
visited[idxA]=inQueueKey;
}
}


// --- ФИНАЛЬНАЯ СБОРКА КОНТУРОВ ---
const finalPolygons=[];
let finalCount=0;


for (let i=0;i < totalNodes;i++){
const p=polygons[i];
if(p!==null){
p.id=finalCount;
const subLen=p.subTriangles.length;
for (let t=0;t < subLen;t++){
if(graph[p.subTriangles[t]]) graph[p.subTriangles[t]].polygon_id=finalCount;
}


finalPolygons.push(p);
finalCount++;
}
}


return finalPolygons;


}
	

// ____________________ build_neighbours_for_convex_polygons ____________________


/**
УСТАНАВЛИВАЕМ СОСЕДЕЙ ДЛЯ ВЫПУКЛЫХ МНОГОУГОЛЬНИКОВ.
*/


static bnfcp_triangle_map=new Int32Array(1024);
static bnfcp_visited_buffer=new Int32Array(256); 
static bnfcp_temp_buffer=new Int32Array(256);


// СКВОЗНОЙ ЗАЩИЩЕННЫЙ СЧЕТЧИК ОПЕРАЦИЙ УНИКАЛИЗАЦИИ
static bnfcp_call_counter=0;


static build_neighbours_for_convex_polygons(polygons,graph){
	
	
const totalOriginalNodes=graph.length;
const numFinal=polygons.length;


// Авто-расширение буферов
if(totalOriginalNodes>this.bnfcp_triangle_map.length){
this.bnfcp_triangle_map=new Int32Array(totalOriginalNodes*2);
}


if(numFinal>this.bnfcp_visited_buffer.length){
this.bnfcp_visited_buffer=new Int32Array(numFinal*2);
this.bnfcp_temp_buffer=new Int32Array(numFinal*2);
}


const triangleToPolygonMap=this.bnfcp_triangle_map;
const visited=this.bnfcp_visited_buffer;
const tempBuffer=this.bnfcp_temp_buffer;


// ШАГ 1: Заполняем карту треугольников смещенными индексами (i+1)
for(let i=0;i<numFinal;i++){
const sub=polygons[i].subTriangles;
const subLen=sub.length;
const polyMarker=i+1; 
for(let s=0;s<subLen;s++){
triangleToPolygonMap[sub[s]]=polyMarker;
}
}


// ШАГ 2: Линейный сбор соседей
for(let i=0;i<numFinal;i++){
const poly=polygons[i];
const oldNeighbours=poly.old_neighbours;
const oldLen=oldNeighbours.length;


const polyMarker=i+1; 
let count=0;


// ИСПРАВЛЕНИЕ: Каждую итерацию по новому полигону i мы сдвигаем глобальный счетчик.
// Маска & 0x7FFFFFFF гарантирует, что число всегда останется положительным 32-битным целым.
this.bnfcp_call_counter=(this.bnfcp_call_counter+1) & 0x7FFFFFFF;


// Уникальный ключ кадра для ТЕКУЩЕГО полигона i. Он гарантированно отличается 
// от ключей всех предыдущих полигонов и прошлых карт!
const visitKey=this.bnfcp_call_counter;


for(let j=0;j<oldLen;j++){
const oldId=oldNeighbours[j];
if(oldId === -1 || oldId >= totalOriginalNodes) continue;


const neighbourPolyMarker=triangleToPolygonMap[oldId];


// Проверяем: Сосед существует (> 0) и это не мы сами (!== polyMarker)
if(neighbourPolyMarker>0 && neighbourPolyMarker!==polyMarker){
const neighbourPolyId=neighbourPolyMarker-1; 


// ИСПРАВЛЕНИЕ БАГА: Сверяем ячейку со сквозным visitKey текущей микро-итерации.
// Совпадение со старыми полигонами или прошлыми картами теперь аппаратно исключено!
if(visited[neighbourPolyId]!==visitKey){
visited[neighbourPolyId]=visitKey; 
tempBuffer[count++]=neighbourPolyId;
}
}
}


// Выделяем PACKED массив идеального размера
const resultNeighbours=new Array(count);
for(let j=0;j<count;j++){
resultNeighbours[j]=tempBuffer[j];
}


poly.neighbours=resultNeighbours;
}


// ТОЧЕЧНАЯ ОЧИСТКА НА ВЫХОДЕ В ДЕФОЛТНЫЕ НУЛИ
for(let i=0;i<numFinal;i++){
const sub=polygons[i].subTriangles;
const subLen=sub.length;
for(let s=0;s<subLen;s++){
triangleToPolygonMap[sub[s]]=0;
}
}


return polygons;


}


// ____________________ build_centroids_for_convex_polygons ____________________


static build_centroids_for_convex_polygons(polygons){
	
	
for(let i=0;i<polygons.length;i++){
	
	
const polygon=polygons[i];
const vertices=polygon.vertices;
const max_vertices=vertices.length;


let sum_x=0;
let sum_y=0;
let sum_z=0;


// СУММИРУЕМ КООРДИНАТЫ ВСЕХ ВЕРШИН МНОГОУГОЛЬНИКА
for(let v=0;v<max_vertices;v++){
	
	
const vertice=vertices[v];
sum_x+=vertice.x;
sum_y+=vertice.y;
sum_z+=vertice.z;


}


// НАХОДИМ СРЕДНЕЕ АРИФМЕТИЧЕСКОЕ — ЭТО И ЕСТЬ ЧЕСТНЫЙ 3D ЦЕНТР МАСС ПОЛИГОНА
polygon.centroid={
x:sum_x/max_vertices,
y:sum_y/max_vertices,
z:sum_z/max_vertices
};
}


return polygons;


}


}


export {navigation_builder};