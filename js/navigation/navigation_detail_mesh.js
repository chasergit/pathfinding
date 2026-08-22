/**


max_slope_degrees-МАКСИМАЛЬНЫЙ УГОЛ НАКЛОНА ТРЕУГОЛЬНИКА, ПО КОТОРОМУ МОЖНО ИДТИ. ОСТАЛЬНЫЕ УДАЛЯЮТСЯ


ОТСТУП cells_padding_xz И cells_padding_y ИСКУССТВЕННО РАСШИРЯЮТ ТРЕУГОЛЬНИКИ ВО ВСЕ СТОРОНЫ,
ЧТОБЫ ОНИ ГАРАНТИРОВАННО ЗАХОДИЛИ В СОСЕДНИЕ ЯЧЕЙКИ СЕТКИ И НАХОДИЛИСЬ ПРИ ПРОВЕРКЕ НАХОЖДЕНИЯ ТОЧКИ В ТРЕУГОЛЬНИКЕ С ПОГРЕШНОСТЬЮ И Т.Д.
padding_xz=0.01; // РАЗМЕР ЯЧЕЙКИ ПО XZ. ДОСТАТОЧНО 0.01, ЕСЛИ БОТ ОТОШЁЛ ОТ ГРАНИЦЫ ТРЕУГОЛЬНИКА МАКСИМУМ НА 0.01, А ЕСЛИ БОЛЬШЕ, ТО УЖЕ НЕ НАЙДЁТ, Т.К. В ТОЙ ЯЧЕЙКЕ МОЖЕТ НЕ ОКАЗАТЬСЯ ТРЕУГОЛЬНИКА 
padding_y=0.01; // РАЗМЕР ЯЧЕЙКИ ПО Y. ДОСТАТОЧНО 0.01, ЧТОБЫ ЗАХВАТИЛО ВЕРХНЮЮ И НИЖНЮЮ ЯЧЕЙКУ 


**/


// БЕЗОПАСНОЕ СМЕЩЕНИЕ, ЧТОБЫ УВЕСТИ ЛЮБЫЕ МИНУСЫ В ПЛЮС
const navigation_spatial_shift_x=17179869184; // 2^34
const navigation_spatial_shift_z=131072; // 2^17
const navigation_spatial_offset=65536; // СИММЕТРИЧНЫЙ СДВИГ ВО ВСЕ СТОРОНЫ КУБА


const area_xz_degeneracy=1e-5; // 0.00001 КВ.М. — ЭТО ПОРОГ ДЛЯ ТРЕУГОЛЬНИКОВ-НИТОК (МУСОР)
const plane_length_sq_degeneracy=1e-12; // ПОГРЕШНОСТЬ ДЛЯ ОПРЕДЕЛЕНИЯ ВЫРОЖДЕННОСТИ ТРЕУГОЛЬНИКА (МУСОР)


class navigation_detail_mesh{


constructor(detail_mesh_nodes,max_slope_degrees=45,cells_padding_xz=0.01,cells_padding_y=0.01,cells_size_xz=1,cells_size_y=1){


this.detail_mesh_nodes=detail_mesh_nodes;
this.cells_array=new Map();
this.cells_count=0;


this.max_slope_degrees=max_slope_degrees;
if(max_slope_degrees===90){
this.max_slope_ny=0;
}
else{
this.max_slope_ny=Math.cos((max_slope_degrees*Math.PI)/180);
}


this.cells_padding_xz=cells_padding_xz;
this.cells_padding_y=cells_padding_y;


this.cells_size_xz=cells_size_xz;
this.cells_size_y=cells_size_y;


// СБРАСЫВАЕМ ГЛОБАЛЬНЫЕ ГРАНИЦЫ В МЕТРАХ
this.cells_min_x_meter=Infinity; // LEFT
this.cells_max_x_meter=-Infinity; // RIGHT
this.cells_min_z_meter=Infinity; // TOP
this.cells_max_z_meter=-Infinity; // BOTTOM
this.cells_min_y_meter=Infinity; // LOW, DOWN
this.cells_max_y_meter=-Infinity; // HIGH, UP


// СБРАСЫВАЕМ ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК В НОМЕРАХ ЯЧЕЕК
this.cells_min_x_num=0; // LEFT
this.cells_max_x_num=0; // RIGHT
this.cells_min_z_num=0; // TOP
this.cells_max_z_num=0; // BOTTOM
this.cells_min_y_num=0; // LOW, DOWN
this.cells_max_y_num=0; // HIGH, UP


}


add(vertices){


let start_time=performance.now();


let cells_padding_xz=this.cells_padding_xz;
let cells_padding_y=this.cells_padding_y;
let cells_size_xz=this.cells_size_xz;
let cells_size_y=this.cells_size_y;


// ПОЛУРАДИУСЫ ЯЧЕЙКИ (РАССТОЯНИЯ ОТ ЦЕНТРА ДО ГРАНЕЙ)
const hx=cells_size_xz/2;
const hz=cells_size_xz/2;
const hy=cells_size_y/2;


// ЗАМЕНЯЕМ: let margin_xz=cells_padding_xz*cells_padding_xz;
// НА ЧЕСТНЫЙ РАДИУС ЯЧЕЙКИ+cells_padding_xz
const cell_radius_xz=Math.sqrt((cells_size_xz/2)**2+(cells_size_xz/2)**2)+cells_padding_xz;
const margin_xz=cell_radius_xz*cell_radius_xz;


let found_area_xz_degeneracy=[];
let found_plane_length_sq_degeneracy=[];


let start_length=this.detail_mesh_nodes.length;
this.detail_mesh_nodes.length=start_length+vertices.length/9;
let id=start_length;


for(let j=0;j<vertices.length;){


let ax=vertices[j++],ay=vertices[j++],az=vertices[j++];
let bx=vertices[j++],by=vertices[j++],bz=vertices[j++];
let cx=vertices[j++],cy=vertices[j++],cz=vertices[j++];


/** ВЕКТОРА РЁБЕР **/
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


/** РАСЧИТЫВАЕМ ПЛОСКОСТЬ И ОТСЕИВАЕМ ОШИБОЧНЫЕ (plane.setFromCoplanarPoints) **/
let nx=bcy*(-abz)-bcz*(-aby);
let ny=bcz*(-abx)-bcx*(-abz);
let nz=bcx*(-aby)-bcy*(-abx);
const plane_length_sq=nx*nx+ny*ny+nz*nz;


// ЗАЩИТА ОТ "ИГОЛОК" И ВЕРТИКАЛЬНОГО МУСОРА НА ВИДЕ СВЕРХУ (XZ)
const area_xz=Math.abs(abx*acz-acx*abz);


if(area_xz<area_xz_degeneracy){
found_area_xz_degeneracy.push(j);
continue;
}


/** ПОРОГ ОТСЕЧЁТ ВЫРОЖДЕННЫЕ (ОШИБОЧНЫЕ) ТРЕУГОЛЬНИКИ, КОТОРЫЕ ПОТОМ МОГУТ ВЫЗВАТЬ ПРОБЛЕМЫ В РАСЧЁТАХ **/
if(plane_length_sq>plane_length_sq_degeneracy){
const invLen=1/Math.sqrt(plane_length_sq);
nx*=invLen;
ny*=invLen;
nz*=invLen;
}
else{
found_plane_length_sq_degeneracy.push(j);
continue;
}


// ОТСЕКАЕМ БОК СТУПЕНЕК И КРУТЫЕ СКЛОНЫ
if(ny<=this.max_slope_ny){ continue; }


const dot00=abx*abx+abz*abz;
const dot01=abx*acx+abz*acz;
const dot11=acx*acx+acz*acz;


const denom=dot00*dot11-dot01*dot01;


// denom-ЭТО МАТЕМАТИЧЕСКИЙ ПОКАЗАТЕЛЬ ПЛОЩАДИ И ПРАВИЛЬНОСТИ ФОРМЫ ТРЕУГОЛЬНИКА НА ПЛОСКОСТИ XZ. ЕСЛИ ОН СЛИШКОМ МАЛ, ТРЕУГОЛЬНИК СЧИТАЕТСЯ "ВЫРОЖДЕННЫМ"
// AAA-СТАНДАРТ ДЛЯ FLOAT 32
if(denom<0.000001){ continue; }


let plane_constant=-(ax*nx+ay*ny+az*nz);


/** КВАДРАТЫ ДЛИНЫ РЕБЁР ТРЕУГОЛЬНИКА В 2D-ПРОЕКЦИИ (XZ). **/
let ab_length_sq_xz=abx*abx+abz*abz;
let bc_length_sq_xz=bcx*bcx+bcz*bcz;
let ca_length_sq_xz=cax*cax+caz*caz;


/** СОЗДАЁМ СВОЙСТВА ТРЕУГОЛЬНИКА **/


// ТАК КАК ВЫРОЖДЕННЫЕ ТРЕУГОЛЬНИКИ УБРАНЫ, ТО ЗАПИСЫВАЕМ ИНВЕРТИРОВАННЫЕ ПЕРЕМЕННЫЕ БЕЗ ПРОВЕРКИ ДЕЛЕНИЯ НА 0


let node={
id:id,
ab_length_sq_xz:ab_length_sq_xz,
bc_length_sq_xz:bc_length_sq_xz,
ca_length_sq_xz:ca_length_sq_xz,
inv_ab_length_sq_xz:1/ab_length_sq_xz,
inv_bc_length_sq_xz:1/bc_length_sq_xz,
inv_ca_length_sq_xz:1/ca_length_sq_xz,
// ДАННЫЕ ПЛОСКОСТИ
nx:nx,
ny:ny,
nz:nz,
inv_ny:1/ny,
scaled_nx:-nx/ny,
scaled_nz:-nz/ny,
scaled_constant:-plane_constant/ny,
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
caz:caz,
denom:denom,
inv_denom:1.0/denom,
dot00:dot00,
dot01:dot01,
dot11:dot11
};


this.detail_mesh_nodes[id]=node;
id++;


// 1. ОПРЕДЕЛЯЕМ ПЕРВИЧНЫЕ ГРАНИЦЫ ТРЕУГОЛЬНИКА (AABB)
let min_x=ax; if(bx<min_x){ min_x=bx; } if(cx<min_x){ min_x=cx; } // LEFT
let max_x=ax; if(bx>max_x){ max_x=bx; } if(cx>max_x){ max_x=cx; } // RIGHT
let min_z=az; if(bz<min_z){ min_z=bz; } if(cz<min_z){ min_z=cz; } // TOP
let max_z=az; if(bz>max_z){ max_z=bz; } if(cz>max_z){ max_z=cz; } // BOTTOM
let min_y=ay; if(by<min_y){ min_y=by; } if(cy<min_y){ min_y=cy; } // LOW, DOWN
let max_y=ay; if(by>max_y){ max_y=by; } if(cy>max_y){ max_y=cy; } // HIGH, UP


// ОБНОВЛЯЕМ ГЛОБАЛЬНЫЕ ГРАНИЦЫ ЯЧЕЕК
if(min_x<this.cells_min_x_meter){ this.cells_min_x_meter=min_x; } // LEFT
if(max_x>this.cells_max_x_meter){ this.cells_max_x_meter=max_x; } // RIGHT
if(min_z<this.cells_min_z_meter){ this.cells_min_z_meter=min_z; } // TOP
if(max_z>this.cells_max_z_meter){ this.cells_max_z_meter=max_z; } // BOTTOM
if(min_y<this.cells_min_y_meter){ this.cells_min_y_meter=min_y; } // LOW, DOWN
if(max_y>this.cells_max_y_meter){ this.cells_max_y_meter=max_y; } // HIGH, UP


// 2. РАСШИРЯЕМ ГРАНИЦЫ НА ВЕЛИЧИНУ PADDING ДО ДЕЛЕНИЯ И ОКРУГЛЕНИЯ.
// МИНИМАЛЬНЫЕ ГРАНИЦЫ УМЕНЬШАЕМ (-), МАКСИМАЛЬНЫЕ УВЕЛИЧИВАЕМ (+).
let cell_min_x=Math.floor((min_x-cells_padding_xz)/cells_size_xz); // LEFT
let cell_max_x=Math.floor((max_x+cells_padding_xz)/cells_size_xz); // RIGHT
let cell_min_z=Math.floor((min_z-cells_padding_xz)/cells_size_xz); // TOP
let cell_max_z=Math.floor((max_z+cells_padding_xz)/cells_size_xz); // BOTTOM
let cell_min_y=Math.floor((min_y-cells_padding_y)/cells_size_y); // LOW, DOWN
let cell_max_y=Math.floor((max_y+cells_padding_y)/cells_size_y); // HIGH, UP


// 3. ТРЕХМЕРНЫЙ ЦИКЛ: РАСПРЕДЕЛЯЕМ ТРЕУГОЛЬНИК ПО МИКРО-ЯЧЕЙКАМ ПРОСТРАНСТВА
for(let x=cell_min_x;x<=cell_max_x;x++){
for(let z=cell_min_z;z<=cell_max_z;z++){


/** ОТСЕКАЕМ ПО XZ **/


let c_cx=(x+0.5)*cells_size_xz;
let c_cz=(z+0.5)*cells_size_xz;


// СЧИТАЕМ ЗНАКОВЫЕ ПЛОЩАДИ ДЛЯ КАЖДОГО РЕБРА
const edge0=(c_cx-ax)*node.abz-(c_cz-az)*node.abx;
const edge1=(c_cx-bx)*node.bcz-(c_cz-bz)*node.bcx;
const edge2=(c_cx-cx)*node.caz-(c_cz-cz)*node.cax;


// ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПО ЧАСОВОЙ СТРЕЛКЕ
let is_strictly_inside=edge0>=0 && edge1>=0 && edge2>=0;
// С УЧЁТОМ ОТСТУПА. ТОЧКА ВНУТРИ ИЛИ СТРОГО НА ГРАНИЦЕ. ТРЕУГОЛЬНИКИ ЗАКРУЧЕНЫ ПО ЧАСОВОЙ СТРЕЛКЕ
let is_inside_with_margin=false;
if(!is_strictly_inside){
is_inside_with_margin=(edge0>=0 || (edge0*edge0<=margin_xz*node.ab_length_sq_xz)) && (edge1>=0 || (edge1*edge1<=margin_xz*node.bc_length_sq_xz)) && (edge2>=0 || (edge2*edge2<=margin_xz*node.ca_length_sq_xz));
}
// ЕСЛИ ЯЧЕЙКА НЕ НАХОДИТСЯ ВНУТРИ И НЕ ПРОШЛА ТЕСТ ПО ОТСТУПАМ — УБИРАЕМ ЕЁ
if(!is_strictly_inside && !is_inside_with_margin) { continue; }


for(let y=cell_min_y;y<=cell_max_y;y++){


/** ОТСЕКАЕМ ПО Y **/


// НАХОДИМ ЦЕНТР ПРОВЕРЯЕМОГО КУБИКА
let c_cy=(y+0.5)*cells_size_y;
// ВЕКТОР ОТ ПЕРВОЙ ВЕРШИНЫ ТРЕУГОЛЬНИКА ДО ЦЕНТРА КУБА
let v_cx=c_cx-ax;
let v_cy=c_cy-ay;
let v_cz=c_cz-az;
// РАССТОЯНИЕ ПО НОРМАЛИ ОТ ЦЕНТРА КУБА ДО ПЛОСКОСТИ ТРЕУГОЛЬНИКА
let distance=node.nx*v_cx+node.ny*v_cy+node.nz*v_cz;
// МАКСИМАЛЬНЫЙ РАДИУС ПРОЕКЦИИ КУБА НА НОРМАЛЬ ТРЕУГОЛЬНИКА
let radius=hx*node.abs_nx+hy*node.abs_ny+hz*node.abs_nz;
// ДОБАВЛЯЕМ ОТСТУП ИМЕННО ТАК
radius+=cells_padding_y;
// ЕСЛИ РАССТОЯНИЕ ДО ПЛОСКОСТИ БОЛЬШЕ РАДИУСА ПРОЕКЦИИ КУБА, ЗНАЧИТ КУБИК НЕ ПЕРЕСЕКАЕТСЯ ТРЕУГОЛЬНИКОМ
if(Math.abs(distance)>radius){ continue; }


let cell_key=(x+navigation_spatial_offset)*navigation_spatial_shift_x+(z+navigation_spatial_offset)*navigation_spatial_shift_z+y+navigation_spatial_offset;


let cell=this.cells_array.get(cell_key);
if(cell===undefined){ 
cell=[];
this.cells_array.set(cell_key,cell);
this.cells_count++;
}
cell.push(node.id);
}
}
}
}


if(this.cells_count>0){


this.cells_min_x_meter-=cells_padding_xz;
this.cells_max_x_meter+=cells_padding_xz;
this.cells_min_z_meter-=cells_padding_xz;
this.cells_max_z_meter+=cells_padding_xz;
this.cells_min_y_meter-=cells_padding_y;
this.cells_max_y_meter+=cells_padding_y;


this.cells_min_x_num=Math.floor(this.cells_min_x_meter/cells_size_xz);
this.cells_max_x_num=Math.floor(this.cells_max_x_meter/cells_size_xz);
this.cells_min_z_num=Math.floor(this.cells_min_z_meter/cells_size_xz);
this.cells_max_z_num=Math.floor(this.cells_max_z_meter/cells_size_xz);
this.cells_min_y_num=Math.floor(this.cells_min_y_meter/cells_size_y);
this.cells_max_y_num=Math.floor(this.cells_max_y_meter/cells_size_y);


}


this.detail_mesh_nodes.length=id; 


if(found_area_xz_degeneracy.length>0){
console.log("Detail mesh. Вырожденные треугольники area_xz: "+found_area_xz_degeneracy.length);
//console.log("Detail mesh. Вырожденные треугольники area_xz: "+found_area_xz_degeneracy.join(","));
}


if(found_plane_length_sq_degeneracy.length>0){
console.log("Detail mesh. Вырожденные треугольники plane_length_sq: "+found_plane_length_sq_degeneracy.length);
//console.log("Detail mesh. Вырожденные треугольники plane_length_sq: "+found_plane_length_sq_degeneracy.join(","));
}


console.log("navigation_detail_mesh: "+(performance.now()-start_time).toFixed(2)+"ms");


}


}


export {navigation_detail_mesh};