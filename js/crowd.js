import * as THREE from "three";

/**
В функции moveAlongSurface стоит отталкивание от стены со значениями 0.0001 и 0.9999 — это финальный, полностью безопасный вариант. Бот не застрянет и не упадёт.
Отталкивание добавлено, чтобы при ходьбе на краю пропасти или стены из-за погрешности, бот не вышел за ребро и не пришлось вызывать функцию поиска ближайшего узла. 
1. Баг "Гигантских координат".
Если бот убежит от центра сцены (0, 0, 0) на расстояние более 5000–10000 метров, точность Float32 в Three.js упадет настолько, что шаг 0.0001 округлится до нуля.
Бот снова начнет соскакивать в пропасть.
Решение (если карта огромная): Держать игровой мир ближе к центру координат или использовать динамический сдвиг, зависящий от масштаба ноды.
2. Баг "Микроскопической геометрии".
Если на карте треугольник NavMesh размером с пуговицу (например, шириной 0.0005 метра), то ограничение safeT (0.0001 и 0.9999) просто "сожрёт" всю длину ребра, и бот не сможет развернуться на этом полигоне.
Решение: При запекании NavMesh в генераторе всегда выставляйте минимальный размер ячейки (Min Region Size) хотя бы в 10–20 сантиметров. Навигационной сетке не нужна микроскопическая детализация.
**/


let new_agent;
let nodes;
let is_point_in_triangle_3d_margin_no_y_checking;
let get_node_margin;


// ДОСТАТОЧНО 1000000 ТРЕУГОЛЬНИКОВ КАРТЫ
let move_along_surface_search_nodes=new Array(1000000); 
let move_along_surface_visited_flags=new Int32Array(1000000); 
let move_along_surface_queue=[];
let move_along_surface_search_id=0;
let move_along_surface_pool_idx=0;
let move_along_surface_search_position=[0,0,0];


let move_along_surface_result={
success:true,
position:[0,0,0],
node_ref_id:-1,
visited_length:0,
visited:new Int32Array(1000) // ЛИМИТ В 1000 ПРОЙДЕННЫХ ТРЕУГОЛЬНИКОВ ЗА 1 КАДР ДОСТАТОЧЕН
};


let move_along_surface_distance_point_to_segment_squared_2d_result={distance_square:0,t:0};


// ДОСТАТОЧНО 1000 ОБЪЕКТОВ ДЛЯ ОБХОДА ЗА 1 КАДР
let move_along_surface_nodes_pool=Array.from({length:1000},()=>({
cost:0,
total:0,
parent_node_ref_id:null,
parent_state:null,
node_ref_id:-1,
state:0,
flags:0,
position:[0,0,0]
}));


function move_along_surface_distance_point_to_segment_squared_2d_raw(out,pt,px,pz,qx,qz){
	
	
const pqx=qx-px;
const pqz=qz-pz;
const dx=pt[0]-px;
const dz=pt[2]-pz;


const d=pqx*pqx+pqz*pqz;
let t=pqx*dx+pqz*dz;
if(d>0){ t/=d; }
if(t<0){ t=0; }
else if(t>1){ t=1; }


const closest_x=px+t*pqx;
const closest_z=pz+t*pqz;
const distance_x=closest_x-pt[0];
const distance_z=closest_z-pt[2];
out.distance_square=distance_x*distance_x+distance_z*distance_z;
out.t=t;


}


function is_point_in_triangle_2d_exact(node,point){


const point_x=point[0];
const point_z=point[2];


// СЧИТАЕМ ЗНАКОВЫЕ ПЛОЩАДИ ДЛЯ КАЖДОГО РЕБРА
const edge0=(point_x-node.ax)*node.abz-(point_z-node.az)*node.abx;
const edge1=(point_x-node.bx)*node.bcz-(point_z-node.bz)*node.bcx;
const edge2=(point_x-node.cx)*node.caz-(point_z-node.cz)*node.cax;


// ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ
return (edge0>=0 && edge1>=0 && edge2>=0);


}


function move_along_surface(agent,start_position,end_position,filter){
	
	
let start_node_id=agent.node_id;

	
const result=move_along_surface_result;
result.success=true;
result.node_ref_id=start_node_id;
result.visited_length=0;


move_along_surface_search_id++;
const current_search_id=move_along_surface_search_id;


move_along_surface_pool_idx=0;
move_along_surface_queue.length=0;
let queue_head=0;


const start_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
start_node.node_ref_id=start_node_id;
start_node.parent_node_ref_id=null;


move_along_surface_search_nodes[start_node_id]=start_node;
move_along_surface_visited_flags[start_node_id]=current_search_id;


let current_best_x=start_position[0];
let current_best_y=start_position[1];
let current_best_z=start_position[2];


let best_distance=Infinity;
let best_node=start_node;


// LERP 0.5
move_along_surface_search_position[0]=start_position[0]+(end_position[0]-start_position[0])*0.5;
move_along_surface_search_position[1]=start_position[1]+(end_position[1]-start_position[1])*0.5;
move_along_surface_search_position[2]=start_position[2]+(end_position[2]-start_position[2])*0.5;


// ДИСТАНЦИЯ
const dx=end_position[0]-start_position[0];
const dy=end_position[1]-start_position[1];
const dz=end_position[2]-start_position[2];
const search_radius_square=(Math.sqrt(dx*dx+dy*dy+dz*dz)/2.0+0.001)**2;


move_along_surface_queue.push(start_node);
const result_out=move_along_surface_distance_point_to_segment_squared_2d_result;


while(queue_head<move_along_surface_queue.length){
	
	
const current_node=move_along_surface_queue[queue_head++]; 
const mesh_node=nodes[current_node.node_ref_id];


// КОНЕЧНАЯ ТОЧКА ВНУТРИ ТРЕУГОЛЬНИКА
if(is_point_in_triangle_2d_exact(mesh_node,end_position)){
	
	
best_node=current_node;
current_best_x=end_position[0]; 
current_best_y=end_position[1]; 
current_best_z=end_position[2];
break;


}


const ax=mesh_node.ax,ay=mesh_node.ay,az=mesh_node.az;
const bx=mesh_node.bx,by=mesh_node.by,bz=mesh_node.bz;
const cx=mesh_node.cx,cy=mesh_node.cy,cz=mesh_node.cz;


// РEБРО 1: СТОРОНА CA
let neighbour_id=mesh_node.neighbour_2;
let is_wall=(neighbour_id===-1 || mesh_node.ca_is_abyss || (filter && !filter.pass_filter(neighbour_id,nodes)) || move_along_surface_visited_flags[neighbour_id]===current_search_id);


// СТЕНА
if(is_wall){
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
}
}
// МОЖНО ИДТИ
else{
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,move_along_surface_search_position,cx,cz,ax,az);
if(result_out.distance_square<=search_radius_square){
const neighbour_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
neighbour_node.parent_node_ref_id=current_node.node_ref_id;
neighbour_node.node_ref_id=neighbour_id;
move_along_surface_search_nodes[neighbour_id]=neighbour_node;
move_along_surface_visited_flags[neighbour_id]=current_search_id;
move_along_surface_queue.push(neighbour_node);
}
}


// РEБРО 2: СТОРОНА AB
neighbour_id=mesh_node.neighbour_0;
is_wall=(neighbour_id===-1 || mesh_node.ab_is_abyss || (filter && !filter.pass_filter(neighbour_id,nodes)) || move_along_surface_visited_flags[neighbour_id]===current_search_id);


// СТЕНА
if(is_wall){
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
}
}
// МОЖНО ИДТИ
else{
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,move_along_surface_search_position,ax,az,bx,bz);
if(result_out.distance_square<=search_radius_square){
const neighbour_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
neighbour_node.parent_node_ref_id=current_node.node_ref_id;
neighbour_node.node_ref_id=neighbour_id;
move_along_surface_search_nodes[neighbour_id]=neighbour_node;
move_along_surface_visited_flags[neighbour_id]=current_search_id;
move_along_surface_queue.push(neighbour_node);
}
}


// РEБРО 3: СТОРОНА BC
neighbour_id=mesh_node.neighbour_1;
is_wall=(neighbour_id===-1 || mesh_node.bc_is_abyss || (filter && !filter.pass_filter(neighbour_id,nodes)) || move_along_surface_visited_flags[neighbour_id]===current_search_id);


// СТЕНА
if(is_wall){
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
}
}
// МОЖНО ИДТИ
else{
move_along_surface_distance_point_to_segment_squared_2d_raw(result_out,move_along_surface_search_position,bx,bz,cx,cz);
if(result_out.distance_square<=search_radius_square){
const neighbour_node=move_along_surface_nodes_pool[move_along_surface_pool_idx++];
neighbour_node.parent_node_ref_id=current_node.node_ref_id;
neighbour_node.node_ref_id=neighbour_id;
move_along_surface_search_nodes[neighbour_id]=neighbour_node;
move_along_surface_visited_flags[neighbour_id]=current_search_id;
move_along_surface_queue.push(neighbour_node);
}
}
}


if(best_node){
	
	
let current_node=best_node;
let count=0;


// ЗАПОЛНЯЕМ Int32Array СРАЗУ В ПРАВИЛЬНОМ ХРОНОЛОГИЧЕСКОМ ПОРЯДКЕ БЕЗ .reverse()
// СНАЧАЛА СЧИТАЕМ ДЛИНУ ЦЕПОЧКИ
while(current_node){
count++;
current_node=current_node.parent_node_ref_id!==null?(move_along_surface_search_nodes[current_node.parent_node_ref_id] || null):null;
}


result.visited_length=count;
current_node=best_node;
let write_idx=count-1;
while(current_node){
result.visited[write_idx--]=current_node.node_ref_id;
current_node=current_node.parent_node_ref_id!==null?(move_along_surface_search_nodes[current_node.parent_node_ref_id] || null):null;
}


result.position[0]=current_best_x;
result.position[1]=current_best_y;
result.position[2]=current_best_z;
result.node_ref_id=best_node.node_ref_id;


const corrected_y=update_position_y(agent,nodes[result.node_ref_id],{x:result.position[0],y:result.position[1],z:result.position[2]});
if(corrected_y!==false){
result.position[1]=corrected_y;
}
else{
result.success=false;
}


}


return result;


}


/**
*Функция пошагового обновления позиции и состояния агента в игровом цикле
*
*@param {Object} agent-Объект бота, содержащий position {x, y, z} и node_id
*@param {Object} velocity_xz-Двухмерный вектор текущей скорости {x, z} (включая силы Separation)
*@param {number} dt-Дельта времени текущего кадра (delta time)
 */
 

let step_agent_current_position=[0,0,0];
let step_agent_desired_target=[0,0,0];
 

function step_agent(agent,velocity_xz,dt){
	

step_agent_current_position[0]=agent.position.x;
step_agent_current_position[1]=agent.position.y;
step_agent_current_position[2]=agent.position.z;


step_agent_desired_target[0]=agent.position.x+velocity_xz.x*dt;
step_agent_desired_target[1]=agent.position.y;
step_agent_desired_target[2]=agent.position.z+velocity_xz.z*dt;


const moveResult=move_along_surface(agent,step_agent_current_position,step_agent_desired_target,null);


if(moveResult.success){
	
	
agent.position.x=moveResult.position[0];
agent.position.y=moveResult.position[1];
agent.position.z=moveResult.position[2];
//agent.node_id=moveResult.node_ref_id; 


// КАКИЕ УЗЛЫ БЫЛИ ПРОЙДЕНЫ ПРИ ПЕРЕМЕЩЕНИИ, ВКЛЮЧАЯ НАЧАЛЬНЫЙ
/*
for(let i=0;i<moveResult.visited_length;i++){
let visited_node_id=moveResult.visited[i];
console.log(visited_node_id);
}
*/


}
else{
alert("УЛЕТЕЛ");
// ФИКС БАГА: ЕСЛИ ПРОИЗОШЕЛ КРИТИЧЕСКИЙ СБОЙ ВЫСОТЫ, ВОЗВРАЩАЕМ БОТА НА БЕЗОПАСНУЮ ПОЗИЦИЮ ПРОШЛОГО КАДРА
// И СЛЕГКА ОТТАЛКИВАЕМ НАЗАД, ЧТОБЫ ОН ГАРАНТИРОВАННО ВЫШЕЛ ИЗ "БИТОЙ" ЗОНЫ МЕША
agent.position.x=step_agent_current_position[0]-velocity_xz.x*dt*0.5;
agent.position.z=step_agent_current_position[2]-velocity_xz.z*dt*0.5;
// ГАСИМ СКОРОСТИ БОТА, ЧТОБЫ ОН НЕ ШТУРМОВАЛ НЕПРОХОДИМЫЙ СКЛОН/СТЕНУ
agent.velocity.x=0;
agent.velocity.z=0;
}


}


function is_point_in_triangle_3d_exact_height_y(node,point){


const point_x=point.x;
const point_z=point.z;


// ИМЕННО ЗДЕСЬ ОПРЕДЕЛЯЕМ ПЕРЕМЕННУЮ, А НЕ В ФОРМУЛЕ. ТАК РАБОТАЕТ БЫСТРЕЕ
const inv_ny=node.inv_ny;
// НАХОДИМ РЕАЛЬНОЕ ЗНАЧЕНИЕ Y В ТОЧКЕ XZ
const expected_y=-(node.nx*point_x+node.nz*point_z+node.plane_constant)*inv_ny;


// СЧИТАЕМ ЧИСТЫЕ ЗНАКОВЫЕ ПЛОЩАДИ
const edge0=(point_x-node.ax)*node.abz-(point_z-node.az)*node.abx;
const edge1=(point_x-node.bx)*node.bcz-(point_z-node.bz)*node.bcx;
const edge2=(point_x-node.cx)*node.caz-(point_z-node.cz)*node.cax;


// ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПРОТИВ ЧАСОВОЙ СТРЕЛКИ
if(edge0>=0 && edge1>=0 && edge2>=0){ return expected_y; }


return false;


}


function update_position_y(agent,node,position){


// СТУПЕНЬ 1: БЫСТРЫЙ ТЕСТ (СТРОГОЕ ПОПАДАНИЕ НА ТЕКУЩИЙ ТРЕУГОЛЬНИК)


let floor_y=is_point_in_triangle_3d_exact_height_y(node,position);


// ПРОВЕРЯЕМ НА !== false, ТАК КАК floor_y МОЖЕТ БЫТЬ РАВЕН 0.0
if(floor_y!==false){
agent.node_id=node.id;
//console.log("current "+agent.node_id);
return floor_y; 
}


// СТУПЕНЬ 2: БЫСТРЫЙ ТЕСТ СОСЕДЕЙ (ПЕРЕХОД НА СМЕЖНЫЙ ТРЕУГОЛЬНИК)


let neighbour_id_0=node.neighbour_0;


if(neighbour_id_0!==-1){
floor_y=is_point_in_triangle_3d_exact_height_y(nodes[neighbour_id_0],position);
if(floor_y!==false){
agent.node_id=neighbour_id_0;
console.log("curexact_height_y_0 "+agent.node_id);
return floor_y; 
}
}


let neighbour_id_1=node.neighbour_1;


if(neighbour_id_1!==-1){
floor_y=is_point_in_triangle_3d_exact_height_y(nodes[neighbour_id_1],position);
if(floor_y!==false){
agent.node_id=neighbour_id_1;
console.log("curexact_height_y_1 "+agent.node_id);
return floor_y; 
}
}


let neighbour_id_2=node.neighbour_2;


if(neighbour_id_2!==-1){
floor_y=is_point_in_triangle_3d_exact_height_y(nodes[neighbour_id_2],position);
if(floor_y!==false){
agent.node_id=neighbour_id_2;
console.log("curexact_height_y_2 "+agent.node_id);
return floor_y; 
}
}


// СТУПЕНЬ 3: ТЕСТ С МАРЖИНОМ ДЛЯ СОСЕДЕЙ (ЗАЩИТА ШВОВ И МИКРО-ЗАЗОРОВ)


// ПЕРЕМЕННЫЕ ДЛЯ ПОИСКА ЛУЧШЕГО ТРЕУГОЛЬНИКА-СОСЕДА НА ШВАХ
let best_neighbour_id=-1;
let min_distance_square=Infinity;
let distance_square=false;
let neighbour_id=-1;


distance_square=is_point_in_triangle_3d_margin_no_y_checking(node,position,0.0025);
// ЗДЕСЬ НЕ НАДО distance_square<min_distance_square, Т.К. ЭТО ПЕРВАЯ ПРОВЕРКА И ВСЕГДА ВЕРНЁТ true
if(distance_square!==false){
min_distance_square=distance_square;
best_neighbour_id=agent.node_id;
}


if(neighbour_id_0!==-1){
distance_square=is_point_in_triangle_3d_margin_no_y_checking(nodes[neighbour_id_0],position,0.0025);
if(distance_square!==false && distance_square<min_distance_square){
min_distance_square=distance_square;
best_neighbour_id=neighbour_id_0;
}
}


if(neighbour_id_1!==-1){
distance_square=is_point_in_triangle_3d_margin_no_y_checking(nodes[neighbour_id_1],position,0.0025);
if(distance_square!==false && distance_square<min_distance_square){
min_distance_square=distance_square;
best_neighbour_id=neighbour_id_1;
}
}


if(neighbour_id_2!==-1){
distance_square=is_point_in_triangle_3d_margin_no_y_checking(nodes[neighbour_id_2],position,0.0025);
if(distance_square!==false && distance_square<min_distance_square){
min_distance_square=distance_square;
best_neighbour_id=neighbour_id_2;
}
}


if(best_neighbour_id!==-1){
agent.node_id=best_neighbour_id;
const best_node=nodes[best_neighbour_id];
// ИМЕННО ЗДЕСЬ ОПРЕДЕЛЯЕМ ПЕРЕМЕННУЮ, А НЕ В ФОРМУЛЕ. ТАК РАБОТАЕТ БЫСТРЕЕ
const inv_ny=best_node.inv_ny;
// НАХОДИМ РЕАЛЬНОЕ ЗНАЧЕНИЕ Y В ТОЧКЕ XZ
alert("3d_margin "+agent.node_id);
return -(best_node.nx*position.x+best_node.nz*position.z+best_node.plane_constant)*inv_ny;
}


// СТУПЕНЬ 4: СПАСЕНИЕ ЧЕРЕЗ GRID (Если пролетели соседей из-за лага/FPS)


let node_margin=get_node_margin(position);
if(node_margin){
agent.node_id=node_margin.id;
const inv_ny=node_margin.inv_ny;
// НАХОДИМ РЕАЛЬНОЕ ЗНАЧЕНИЕ Y В ТОЧКЕ XZ
alert("get_node_margin "+agent.node_id);
return -(node_margin.nx*position.x+node_margin.nz*position.z+node_margin.plane_constant)*inv_ny;
}


return false;


}


// ____________________ set_target_direction ____________________


function set_target_direction(agent){


const object=agent.object;
const p=agent.path[agent.next_path_point];
const pt={x:p.x,y:p.y,z:p.z};
const quaternion=object.quaternion.clone();
object.lookAt(pt.x,object.position.y,pt.z);
agent.quaternion=object.quaternion.clone();
object.quaternion.copy(quaternion);


}


class crowd{


constructor(data,crowd_debug){


this.app=data;
let app=data;
this.pathfinder=app.pathfinder;


this.crowd_debug=crowd_debug;
this.helpers_created=false;
if(crowd_debug){ this.helpers_turn_on(); }


new_agent=this;
window.new_agent=new_agent;


this.agents={};
//this.agent_id_counter=0;



const fps=60;


is_point_in_triangle_3d_margin_no_y_checking=app.pathfinder._is_point_in_triangle_3d_margin_no_y_checking;
get_node_margin=app.pathfinder.get_node_margin;


}


// ____________________ helpers_turn_on ____________________


helpers_turn_on(){
	
	
this.crowd_debug=true;
if(!this.helpers_created){
this.helpers_created=true;
this.helpers_create();
}
this.mesh_crowd_helpers.visible=true;


}


// ____________________ helpers_turn_off ____________________


helpers_turn_off(){
	
	
this.crowd_debug=false;
this.mesh_crowd_helpers.visible=false;


}


// ____________________ helpers_create ____________________


helpers_create(){


this.mesh_crowd_helpers=new THREE.Group();
this.app.scene.add(this.mesh_crowd_helpers);


// 10000 ЗАЙМЁТ 1.25МБ ПАМЯТИ
this.mesh_agents_body=new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.05,0.2,4,8).translate(0,0.15,0),new THREE.MeshLambertMaterial({color:0xff0000}),10000);
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


// ____________________ helpers_update ___________________


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


for(const agent_id in this.agents){


let agent=this.agents[agent_id];	


let position=agent.position;
let offset=mesh_agents_body_count*16;
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
mesh_agents_arrow_instanceMatrix_array[offset+2]=xz2 - wy2;
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


// ____________________ add_agent ____________________


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


corridor_buffers:corridor_buffers,
corridor:corridor_buffers[0], // ASTAR. КОРИДОР ИЗ ID УЗЛОВ ОТ СТАРТА ДО ЦЕЛИ
path_buffers:path_buffers,
path:path_buffers[0], // CHANNEL. ПУТЬ ИЗ ТОЧЕК ОТ СТАРТА ДО ЦЕЛИ
path_corridor_buffer_index:1, // КУДА ЗАПИСЫВАТЬ РЕЗУЛЬТАТ


clamp_step_state:false,
clamp_step_position:{x:0,y:0,z:0},


path_target_position:{x:0,z:0},
next_path_point:0,


position:options.object.position,
n_position:[0,0,0], // ЖЕЛАЕМАЯ ПОЗИЦИЯ
velocity:{x:0,z:0}, // ТЕКУЩАЯ СКОРОСТЬ
n_velocity:[0,0,0], // ЖЕЛАЕМАЯ СКОРОСТЬ


target_node_id:0, // ID УЗЛА ЦЕЛИ
target_position:[0,0,0], // КООРДИНАТЫ ЦЕЛИ


n_corners:0, // КОЛИЧЕСТВО УГЛОВ В НАЙДЕННОМ ПУТИ


// === НАСТРОЙКИ СГЛАЖИВАНИЯ И ОПТИМИЗАЦИИ ПУТИ (STRING PULL) ===
// Дальность «взгляда» алгоритма оптимизации пути вперед по полигонам.
// Чем больше значение, тем раньше String Pull начнет сглаживать дальние углы.
max_look_ahead:10.0, 



}


//this.app.scene.add(options.object);
this.agents[options.name]=agent;


return agent; 


}


// ____________________ remove_agent ____________________


remove_agent(id){
	
	
if(this.agents[agent_id]){
delete this.agents[agent_id];
return true;
}
return false;


}


// ____________________ set_data ____________________


set_data(data){
nodes=data.nodes;
}


// ____________________ new_path ____________________


new_path(pt){


const agent=this.agents["0"];


let result=this.pathfinder.find_path(agent,pt);


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


// ____________________ move ____________________


move(agent,dt){
	
	
const speed=agent.speed;


let path_target_position=agent.path_target_position;
let velocity=agent.velocity;


if(agent.next_path_point!=0){


let cp=agent.path[agent.next_path_point];
path_target_position.x=cp.x;
path_target_position.z=cp.z;


velocity.x=cp.x-agent.position.x;
velocity.z=cp.z-agent.position.z;


let velocity_lengthSq=velocity.x*velocity.x+velocity.z*velocity.z;


let path_leg_complete=false;
// !!! ЭТО НА УГЛАХ ДАЁТ ОТТАЛКИВАНИЕ. ПЕРЕДЕЛАТЬ 
//if(velocity_lengthSq<0.0025){path_leg_complete=true; console.log(velocity_lengthSq+" VVVVVVVVVV "+cp.x+" "+cp.z+" "+agent.position.x+" "+agent.position.z);}
//console.log(agent.next_path_point);


if(!path_leg_complete){


let dx=agent.position.x-path_target_position.x;
let dz=agent.position.z-path_target_position.z;
let previous_distanceToSquared=dx*dx+dz*dz;


let old=velocity.x;
let divide=1/Math.sqrt(velocity_lengthSq);
if(velocity_lengthSq==0){divide=0;}
velocity.x*=divide;
velocity.y*=divide;
velocity.z*=divide;
if(agent.quaternion){agent.object.quaternion.slerp(agent.quaternion,0.1);}

let dt_speed=dt*0.1;
velocity.x*=dt_speed;
 velocity.y*=dt_speed;
 velocity.z*=dt_speed;
//agent.position.add(velocity.multiplyScalar(dt*speed));

  
let xx=agent.position.x;
let yy=agent.position.y;
let zz=agent.position.z;
velocity.y=0;
//agent.position.add(velocity);


step_agent(agent,{x:velocity.x,z:velocity.z},dt*300);


dx=agent.position.x-path_target_position.x;
dz=agent.position.z-path_target_position.z;
let new_distanceToSquared=dx*dx+dz*dz;


path_leg_complete=(new_distanceToSquared >= previous_distanceToSquared);
//console.log(Math.sqrt(new_distanceToSquared)+" "+Math.sqrt(previous_distanceToSquared)+" "+path_leg_complete);
//console.log(velocity_lengthSq+" fghfghfg "+cp.x+" "+cp.z+" "+agent.position.x+" "+agent.position.z+" Y="+agent.position.y);
/*
let y=update_position_y(nodes[agent.node_id],agent.position);
if(y!==false){
agent.position.y=y;
console.log(agent.position.y);
}
else{
console.log("net");
}
console.log(agent.node_id);
*/

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


// ____________________ update ____________________


update(dt){


for(const agent_id in this.agents){


const agent=this.agents[agent_id];	
this.move(agent,dt);


}


if(this.crowd_debug){
this.helpers_update();
}

	
}


}


window.move_along_surface=move_along_surface;
window.nodes=nodes;


export {crowd};
