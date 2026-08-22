/*
let node_id=10;
let current_pos={x:-3.3745537771495986,y:0.5395085876936967,z:4.277031691637208};
let desired_target={x:-2.4190906172030804,y:2.3664538860321045,z:1.0925142885259975};
let min=9090;
let agent=aaa.crowd.agents["0"];
for(let z=0;z<5;z++){
let started=performance.now();
for(let n=0;n<200000;n++){
agent.node_id=node_id;
move_along_surface(agent,current_pos,desired_target,null,false);
}
let elap=performance.now()-started;
if(min>elap){ min=elap; }
}
console.log(min);


316ms
*/


/*


let start_position={x:3.5323287795936005,y:0.36645400524139404,z:-4.591340806508383};
let end_position={x:-0.5840532499185427,y:3.966454982757568,z:2.1628270784186396};
let min=9090;
let agent=aaa.crowd.agents["0"];
agent.node_id=513;
//node_end=nodes[132];
agent.position.set(3.5323287795936005,0.36645400524139404,-4.591340806508383);
for(let z=0;z<5;z++){
let started=performance.now();
for(let n=0;n<20000;n++){
aaa.pathfinder.find_simple_path(agent,end_position);
}
let elap=performance.now()-started;
if(min>elap){ min=elap; }
}
console.log(min);


407ms
*/

/*


let ppp={x:6.687823714895098,y:0.5961082204855845,z:3.7702620598914383};
let clamped_position={x:0,y:0,z:0};
let node=aaa.pathfinder.nodes[3];
let min=9090;
for(let z=0;z<5;z++){
let started=performance.now();
for(let n=0;n<50000;n++){
aaa.pathfinder.clamp_step(node,ppp,clamped_position,200);
}
let elap=performance.now()-started;
if(min>elap){ min=elap; }
}
console.log(min);

351ms
*/


import * as THREE from "three";
import * as THREE_GLTFLoader from "three/addons/loaders/GLTFLoader.js";
import {GUI} from "three/addons/libs/lil-gui.module.min.js";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";
import {crowd} from "./crowd.js";
import {pathfinding} from "./navigation/pathfinding.js";
import {navigation_helper} from "./navigation/navigation_helper.js";
import Stats from "./stats/stats.js";
import GPUStatsPanel from "./stats/gpu_stats.js";
import renderer_stats from "./stats/renderer_stats.js";


let mesh=[];
let helper=[];


let agents;
let agents_count=0;


let GLTFLoader=new THREE_GLTFLoader.GLTFLoader();


let global_scale=1;


class Game{


constructor(){
	
	
window.aaa=this;

this.debug={showPath:true};


this.pathfinder=new pathfinding();
this.zone_name="island";


let project=document.getElementById("project");


function createPanel(){


const panel=new GUI({width:310});
const folder1=panel.addFolder("Visibility");
const folder2=panel.addFolder("Activation/Deactivation");


let settings={
"show model":true,
"show skeleton":false,
};


folder1.add(settings,"show model").onChange(showModel);
folder1.add(settings,"show skeleton").onChange(showSkeleton);



folder1.open();


}


createPanel();


function showModel(visibility){


if(this.ball.pathLines){ this.ball.pathLines.visible=visibility; }
this.debug.showPath=visibility;


}


function showSkeleton(visibility){
}


this.camera=new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 30000);
this.camera.position.set(0, 10*global_scale, 0);
this.camera.lookAt(0,0,0);


this.scene=new THREE.Scene();
this.scene.background=new THREE.Color(0xaaaaff);





const geometry=new THREE.BoxGeometry(1*global_scale,1*global_scale,1*global_scale);
geometry.translate(0,0.5*global_scale,0);
const material=new THREE.MeshStandardMaterial({color:0xff0000});
const mesh_debug_meter=new THREE.Mesh(geometry,material);
this.scene.add(mesh_debug_meter);

console.log(this.scene);
const ambient=new THREE.HemisphereLight(0x555555,0x999999);
this.scene.add(ambient);


this.sun=new THREE.DirectionalLight(0xffffff,4.0);
this.sun.position.set(0,10,5);
this.sun.target.position.set(0,0,0);
this.sun.castShadow=true;
this.sun.shadow.mapSize.width=2048; // 8192 - ВЫЗЫВАЕТ БОЛЬШУЮ НАГРУЗКУ НА ВИДЕОКАРТУ, ЕСЛИ ПОСТОЯННОЕ ОБНОВЛЕНИЕ ТЕНЕЙ
this.sun.shadow.mapSize.height=2048; // 8192 - ВЫЗЫВАЕТ БОЛЬШУЮ НАГРУЗКУ НА ВИДЕОКАРТУ, ЕСЛИ ПОСТОЯННОЕ ОБНОВЛЕНИЕ ТЕНЕЙ
this.sun.shadow.camera.near=1.0;
this.sun.shadow.camera.far=2000;
this.sun.shadow.camera.left=-10;
this.sun.shadow.camera.right=10;
this.sun.shadow.camera.top=10;
this.sun.shadow.camera.bottom=-10;
this.sun.shadow.bias=0;
this.sun.shadow.normalBias=0.01;
this.sun.shadow.radius=0.2; // 1 - DEFAULT
this.sun.shadow.blurSamples=2; // 8 - DEFAULT

this.scene.add(this.sun);


this.renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,alpha:true,premultipliedAlpha:true,logarithmicDepthBuffer:false});
this.renderer.setClearColor(0x000000,0); // ЦВЕТ И ПРОЗРАЧНОСТЬ ФОНА (alpha). 0 - НЕ ПРОЗРАЧНЫЙ, 1 - ПРОЗРАЧНЫЙ
this.renderer.setPixelRatio(window.devicePixelRatio);
this.renderer.setSize(window.innerWidth,window.innerHeight);
this.renderer.autoClear=false;
this.renderer.info.autoReset=false;
this.renderer.shadowMap.enabled=true;
this.renderer.outputEncoding=THREE.sRGBEncoding;


// ____________________ СТАТИСТИКА ____________________


this.stats;
window.stats_show=true; // ОТОБРАЖЕНИЕ ПАНЕЛИ СТАТИСТИКИ
if(stats_show){
this.stats=new Stats();
project.appendChild(this.stats.dom);
}


this.gpu_stats;
if(stats_show){
window.gpu_stats=this.gpu_stats=new GPUStatsPanel(this.renderer.getContext());
window.gpu_stats_shader_name=""; // ДЛЯ ЗАМЕРА ВРЕМЕНИ ПОСТЭФФЕКТА
this.stats.addPanel(this.gpu_stats);
}


this.renderer_stats;
let renderer_stats_show=true; // ОТОБРАЖЕНИЕ ПАНЕЛИ СТАТИСТИКИ
if(renderer_stats_show){
this.renderer_stats=new renderer_stats();
project.appendChild(this.renderer_stats.renderer_stats_canvas);
}


this.controls= new OrbitControls(this.camera, this.renderer.domElement);
this.controls.damping=0.2;

this.timer=new THREE.Timer();
this.timer.connect(document);


this.loadEnvironment();

this.raycaster=new THREE.Raycaster();
this.renderer.domElement.addEventListener("click",(e)=>this.raycast(e,this),false);


this.loading=true;


window.addEventListener("resize", this.resize.bind(this));


}


raycast(e){


let agent=agents["0"];
if(agent.state!=1){ return; }


let mouse={x:0,y:0};
let raycaster=this.raycaster;


mouse.x=(e.clientX / window.innerWidth) * 2 - 1;
mouse.y=- (e.clientY / window.innerHeight) * 2 + 1;


raycaster.setFromCamera(mouse, this.camera);


const intersects=raycaster.intersectObject(this.navmesh);


if (intersects.length>0){
const point=intersects[0].point;

let group=aaa.pathfinder.get_group(point,true);


console.log("[GROUP]: "+group+" [AGENT]: "+agent.position.x+", "+agent.position.y+", "+agent.position.z+" [TARGET]: "+point.x+", "+point.y+", "+point.z);


// 1. ИСПРАВЛЕН БАГ. ИСПРАВЛЕН CHANNEL, КОГДА ПРОКЛАДЫВАЛСЯ НЕВЕРНО ПУТЬ ЕСЛИ НАЧАЛЬНАЯ ТОЧКА НАХОДИЛАСЬ ЧУТЬ ЗА ГРАНИЦЕЙ ТРЕУГОЛЬНИКА, Т.Е. ТРЕУГОЛЬНИК НАХОДИЛСЯ ЧЕРЕЗ EPSILON,
// А СТАРЫЙ CHANNEL НЕ СПРАВЛЯЛСЯ С ЭТИМ И ПРОКЛАДЫВАЛ ПУТЬ НЕ К ТОЙ ВЕРШИНЕ ТРЕУГОЛЬНИКА, Т.Е. НАДО БЫЛО К ПЕРЕДНЕЙ, А ОН К ТОЙ ЧТО СБОКУ.
// 2. ИСПРАВЛЕН БАГ. КОГДА 2 ЦЕНТРОИДА ПО РАССТОЯНИЮ ПОЧТИ ОДИНАКОВЫ, НО ПО ПОГРЕШНОСТИ ВЫБИРАЕТСЯ ДВА ЭТИХ ТРЕУГОЛЬНИКА И ТАК КАК ПЕРВЫЙ БЛИЖЕ ПО ЦЕНТРОИДУ ТО ТОЧКА СТАВИТСЯ НАЗАД. ИСПРАВЛЯЕТСЯ СОРТИРОВКОЙ ПО РАССТОЯНИЮ ДО ГРАНИ.
// 3. ИСПРАВЛЕН БАГ. ОТСУТСТВИЯ НАЧАЛЬНОГО ЦЕНТРОИДА, ОТЧЕГО ПО ВОЗДУХУ ИДЁТ
//agent.position.set(-3.452511259684619, 2.37, 1.452511259684619 );
//point.set(-3.6276350102482864, 2.2185841885412847, 2.0095574830372307);
// 4. ИСПРАВЛЕН БАГ. КОГДА ТОЧКА ПРЯМО НА ВЕРШИНЕ ТРЕУГОЛЬНИКА. НА СКЛОНЕ ВНИЗУ. ИСПРАВЛЯЕТСЯ В CHANNEL
//agent.position.set(-3.32, 0.97, 3.72);
//point.set(-3.50, 1.058, 3.61);
// 5. ИСПРАВЛЕН БАГ. КОГДА ТОЧКА ПРЯМО НА ВЕРШИНЕ ТРЕУГОЛЬНИКА. НАВЕРХУ. ИСПРАВЛЯЕТСЯ В CHANNEL
//agent.position.set(0.34, 2.77, -1.26);
//point.set(-0.8931065285511197, 2.651784525332509, 0.05150826370948902);
// 6. ИСПРАВЛЕН БАГ. ПРЯМО НА ВЕРШИНЕ НАВЕРХУ
//agent.position.set(-3.41,2.37,1.41);
//point.set(-2.720378940111204, 0.3700000047683716, 3.4526808854706905); 
// 7. ИСПРАВЛЕН БАГ. ВЕРНУЛАСЬ КРАСНАЯ ЛИНИЯ 1
//agent.position.set(-3.478073965898358, 0.7173993984772022, 3.9521666149803836);
//point.set(-3.463703013714201, 0.5617200556352273, 4.108295915346434);
// 8. ИСПРАВЛЕН БАГ. ВЕРНУЛАСЬ КРАСНАЯ ЛИНИЯ 2
//agent.position.set(-3.40, 0.865, 3.72);
//point.set(-3.50, 1.058, 3.61);
// 9. ИСПРАВЛЕН БАГ. ВЕРНУЛАСЬ КРАСНАЯ ЛИНИЯ 3
//agent.position.set(-3.04351, 0.40135, 3.91410);
//point.set(-3.39174, 0.803802, 3.808372);

//agent.position.set(-0.38, 0.7, 0.25);
//point.set(0.12, 0.5, -0.25);
//agent.position.set(-0.25, 0.5, 0.25);
//point.set(0.3, 0.5, -0.25);
//agent.position.set(0.13337104273375303, 0.5, 0.35209146198768315);
//point.set(-0.3152678501347033, 0.5, -0.2729427903019624);

//agent.position.y=0.67;


// 10. В ЯЧЕЙКЕ И ПОДНОЖЬЯ НЕ НАХОДИТ, ЕСЛИ ДИСТАНЦИЯ ПО ОСИ Y МАЛЕНЬКАЯ
//agent.position.set(-3.4830583976942484,0.7155065434766102,3.939488130195736);
//point.set(-3.998175472547385,0.5557438782371924,4.202907873977528);

// 11.
//agent.position.set(-2.7441617701057806, 0.37, 3.546582267948036);
//point.set(0.8838717574673574, 2.6998064737143626, -1.8882783002032786);

// 12. ТОЧКУ НАЧАЛА СТАВИТ ЗАДИ СЕБЯ. ИСПРАВЛЕНО В CHANNEL ЧЕРЕЗ EPSILON
//agent.position.set(-3.411250573734816, 0.57, 4.0217434965440475);
//point.set(-4.263153269469018, 0.5477452310471687, 4.312222326918701);

// 13. НЕВЕРНЫЙ ТРЕУГОЛЬНИК ВЫБИРАЛ. ИСПРАВЛЕНО В PATHFINDING GET_NODE_MARGIN УДАЛЕНИЕМ ОДНОГО SQUARE, Т.К. СЧИТАЛО НЕВЕРНО  
//agent.position.set(-3.213775490623269, 0.6076966510054417, 3.9257286853197475);
//point.set(-4.029041395539171, 2.3664538860321045, 1.0654076175405782);


this.crowd.new_path({x:point.x,y:point.y,z:point.z},true);


}


}


add_agent(options){


let name=options.name;


const geometry=new THREE.BoxGeometry(0.1*global_scale,0.2*global_scale,0.05*global_scale);
geometry.translate(0,0.1*global_scale,0);
mesh[name]=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xff0000}));
mesh[name].position.set(-3.213775490623269,0.6076966510054417,3.9257286853197475);
mesh[name].position.set(-3.3745537771495986,0.5395085876936967,4.277031691637208);


mesh[name].position.x*=global_scale;
mesh[name].position.y*=global_scale;
mesh[name].position.z*=global_scale;


options.object=mesh[name];
options.position.x=mesh[name].position.x;
options.position.y=mesh[name].position.y;
options.position.z=mesh[name].position.z;


return this.crowd.add_agent(options);


}


resize(){
this.camera.aspect=window.innerWidth/window.innerHeight;
this.camera.updateProjectionMatrix();
this.renderer.setSize(window.innerWidth,window.innerHeight); 
}


loadEnvironment(){


const self=this;


GLTFLoader.load(
`./models/vbn.glb`,
function(gltf){
gltf.scene.traverse(function(child){
if(child.isMesh){
child.material.color.set(0xffffff);
child.material.side=2;
child.name="level";
child.castShadow=true;
child.receiveShadow=true;
self.scene.add(child);
self.level=child;
self.detail_mesh=child;
self.load_other();
}
}
);
});


}


load_other(){
	
	
const self=this;



let TextureLoader=new THREE.TextureLoader();
let tex=[];
tex["floor"]=TextureLoader.load("./textures/stectile1quad.png");
tex["floor"].colorSpace=THREE.SRGBColorSpace;
tex["floor"].wrapS=tex["floor"].wrapT=THREE.RepeatWrapping;
tex["floor"].repeat.set(30,30);
tex["floor"].flipY=false;
self.level.material.map=tex["floor"];
tex["floor_n"]=TextureLoader.load("./textures/stectile1quad_local.png");
tex["floor_n"].wrapS=tex["floor_n"].wrapT=THREE.RepeatWrapping;
tex["floor_n"].repeat.set(30,30);
tex["floor_n"].flipY=false;
self.level.material.normalMap=tex["floor_n"];
self.level.material.normalScale.set(5,5);


GLTFLoader.load(


`./models/level.nav.glb`,


function (gltf) {



gltf.scene.traverse(function (child) {
if(child.isMesh){


for(let n=0;n<child.geometry.attributes.position.array.length;n++){
child.geometry.attributes.position.array[n]*=global_scale;
}
child.geometry.attributes.position.needsUpdate=true;
child.geometry.computeBoundingBox();
child.geometry.computeBoundingSphere();


/*
for(let n=0;n<child.geometry.attributes.position.array.length;n++){
let ab=child.geometry.attributes.position.array[n];
ab=Math.round(ab*100)/100;
console.log(ab);
child.geometry.attributes.position.array[n]=ab;
console.log(child.geometry.attributes.position.array[n]);
}
child.geometry.attributes.position.needsUpdate=true
*/

/*
let g=child.geometry;
let p=g.getAttribute("position");
//console.log(p.getX(405)+" "+p.getY(405)+" "+p.getZ(405));
for (let i=0; i<p.count; i++) { 
let x=Math.round(p.getX(i)*100)/100;
let y =Math.round(p.getY(i)*100)/100;
let z=Math.round(p.getZ(i)*100)/100;
p.setXYZ(i, x, y, z);
}
  
  
p.setXYZ(405, 0.30, 3.00, -1.26);
p.setXYZ(406, p.getX(405), p.getY(405), p.getZ(406));
p.setXYZ(407, p.getX(407), p.getY(405), p.getZ(405));  
p.needsUpdate=true;
//console.log(p.getX(405)+" "+p.getY(405)+" "+p.getZ(405));


let newPositions=[];
newPositions.push(p.getX(405),p.getY(405),p.getZ(405), p.getX(406),p.getY(406),p.getZ(406), p.getX(407),p.getY(407),p.getZ(407));
*/

//const positionAttribute=new THREE.BufferAttribute(new Float32Array(newPositions),3,false);
//child.geometry=new THREE.BufferGeometry();
//child.geometry.setAttribute("position",positionAttribute);


//const positionAttribute=new THREE.BufferAttribute(new Float32Array([5,3,5,   5,3,0, 0.09,3,0,   0.09,3,0,   0,3,5,  5,3,5]),3,false);
//child.geometry=new THREE.BufferGeometry();
//child.geometry.setAttribute("position",positionAttribute);


const test_geometry=new THREE.BoxGeometry(1, 1, 1,4,1,4);
//test_geometry.translate(0, 0.1, 0);
//child.geometry=test_geometry;


self.navmesh=child;


let mesh=new THREE.Mesh(child.geometry,new THREE.MeshBasicMaterial({color:0x00ffff,transparent:true,opacity:0.2}));
mesh.position.copy(child.position);
mesh.quaternion.copy(child.quaternion);
mesh.position.y+=0.012*global_scale;
mesh.name="island";
self.scene.add(mesh);


let mesh_navesh_wireframe=new THREE.Mesh(child.geometry,new THREE.MeshBasicMaterial({wireframe:true,color:0xffffff}));
mesh_navesh_wireframe.position.copy(child.position);
mesh_navesh_wireframe.quaternion.copy(child.quaternion);
mesh_navesh_wireframe.position.y+=0.012*global_scale;
self.scene.add(mesh_navesh_wireframe);


}
});


let start_time=performance.now();


let detail_mesh=self.detail_mesh.geometry.clone();
if(detail_mesh.index){
detail_mesh=detail_mesh.toNonIndexed();
}
detail_mesh=detail_mesh.attributes.position.array;


self.pathfinder.build_zone({zone_name:self.zone_name,geometry:self.navmesh.geometry,detail_mesh,tolerance:1e-4,precision:2,max_slope_deviaton_dot:0.999,
//navigation_grid_cells_padding_xz:0.01,navigation_grid_cells_padding_y:0.001,navigation_grid_cells_size_xz:0.2,navigation_grid_cells_size_y:0.2,
navigation_grid_cells_padding_xz:0.04*global_scale,navigation_grid_cells_padding_y:0.04*global_scale,navigation_grid_cells_size_xz:0.1*global_scale,navigation_grid_cells_size_y:0.1*global_scale,
navigation_detail_mesh_climb:0.7,navigation_detail_mesh_height:0.4,
navigation_detail_mesh_max_slope_degrees:89,navigation_detail_mesh_cells_padding_xz:1.04*global_scale,navigation_detail_mesh_cells_padding_y:1.04*global_scale,navigation_detail_mesh_cells_size_xz:1.1*global_scale,navigation_detail_mesh_cells_size_y:1.1*global_scale,
});


// УСТАНАВЛИВАЕМ ДАННЫЕ ТЕКУЩЕЙ КАРТЫ
self.pathfinder.set_data("island");


self.crowd=new crowd(self,true);
agents=self.crowd.agents;
// УСТАНАВЛИВАЕМ ДАННЫЕ ТЕКУЩЕЙ КАРТЫ
self.crowd.set_data("island");



self.add_agent({name:String(agents_count++),radius:0.2,height:2,position:{x:0,y:0,z:0}});


let agent=agents["0"];
let node=self.pathfinder.get_node_exact(agent.position);
agent.node_id=node.id;
agent.state=1;


let get_detail_mesh_y_result=self.crowd.get_detail_mesh_y(agent);
if(get_detail_mesh_y_result!==false){
agent.position.y=get_detail_mesh_y_result;
}


for(let n=0;n<10;n++){
	
	
self.add_agent({name:String(agents_count),radius:0.2,height:2,position:{x:0,y:0,z:0}});
agent=agents[String(agents_count)];
agent.node_id=node.id;
agent.state=1;
agents_count++;


let get_detail_mesh_y_result=self.crowd.get_detail_mesh_y(agent);
if(get_detail_mesh_y_result!==false){
agent.position.y=get_detail_mesh_y_result;
}


}



//helper["navigation_convex_polygon"]=navigation_helper.create_navigation_convex_polygon_helper(self.pathfinder.nodes_2,0.01*global_scale);
//self.scene.add(helper["navigation_convex_polygon"]);
//helper["navigation_graph"]=navigation_helper.create_navigation_graph_helper(self.pathfinder.nodes_2,0.02*global_scale,1*global_scale,0xffffff,0x4e84c4);
//self.scene.add(helper["navigation_graph"]);
//helper["navigation_abyss"]=navigation_helper.create_navigation_abyss_helper(self.pathfinder.nodes,self.pathfinder.vertices,0.016*global_scale);
//self.scene.add(helper["navigation_abyss"]);
//helper["navigation_nodes_labels"]=navigation_helper.create_navigation_nodes_labels_helper(self.pathfinder.nodes,1*global_scale,0.04*global_scale);
//self.scene.add(helper["navigation_nodes_labels"]);
//helper["navigation_detail_mesh_helper"]=navigation_helper.create_navigation_detail_mesh_helper(self.pathfinder.detail_mesh_nodes,0.01*global_scale,0x009000);
//self.scene.add(helper["navigation_detail_mesh_helper"]);
//helper["navigation_detail_mesh"]=navigation_helper.create_navigation_spatial_helper(self.pathfinder.navigation_detail_mesh,0x00ff00);
//self.scene.add(helper["navigation_detail_mesh"]);
//helper["navigation_grid"]=navigation_helper.create_navigation_spatial_helper(self.pathfinder.navigation_grid,0x00ff00);
//self.scene.add(helper["navigation_grid"]);


self.loading=false;
self.render();


}
);
}



render(){


requestAnimationFrame(this.render.bind(this));


if(stats_show){ this.stats.update(); }


this.timer.update();
let delta_time=Math.min(this.timer.getDelta(),0.1);


let start_time=performance.now();


for(const agent_id in agents){


const agent=agents[agent_id];	


if(agent_id=="0"){ continue; }


if(agent.next_path_point==0 && agent.state==1){


agent.next_path_point=1;
let num=Math.floor(Math.random()*350);
let node_end_id=this.pathfinder.zones["island"].groups[0][num];
//node_end_id=agent.node_id;
let node_end=this.pathfinder.zones["island"].nodes[node_end_id];


// ЕСЛИ СТАРТОВЫЙ И КОНЕЧНЫЙ УЗЛЫ СОВПАДАЮТ
if(agent.node_id==node_end_id){


agent.corridor.length=1;
agent.corridor[0]=agent.node_id;
agent.path.length=2;
agent.path[0]=agent.position;
agent.path[1]=node_end.centroid;


}


else{
	

let end_position=this.pathfinder.get_random_point_in_node(node_end);


let desired_corridor=agent.corridor_buffers[agent.path_corridor_buffer_index];
let corridor_result=this.pathfinder.astar.search(desired_corridor,this.pathfinder.zones["island"].nodes[agent.node_id],node_end,agent.position,end_position);


let desired_path=agent.path_buffers[agent.path_corridor_buffer_index];
this.pathfinder.channel.string_pull(desired_corridor,agent.position,end_position,desired_path);


// ЕСЛИ РЕЗУЛЬТАТ УСТРАИВАЕТ, ТО МЕНЯЕМ БУФЕР
agent.path_corridor_buffer_index=(agent.path_corridor_buffer_index+1)%11;
agent.corridor=desired_corridor;
agent.path=desired_path;


}


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


}


this.crowd.update(delta_time);


let end_time=performance.now()-start_time;


document.getElementById("total_time").innerHTML=end_time.toFixed(4);


if(stats_show && gpu_stats_shader_name==""){ gpu_stats.startQuery(); }
this.renderer_stats.renderer_stats_update(0,this.renderer);
this.renderer.info.reset();
this.renderer.render(this.scene,this.camera);
if(stats_show && gpu_stats_shader_name==""){ gpu_stats.endQuery(); }


}


}


export {Game};