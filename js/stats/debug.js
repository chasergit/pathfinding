let debug_show=true; // false - НЕ ОТОБРАЖАТЬ СТАТИСТИКУ, true - ОТОБРАЖАТЬ
let debug_mode="full"; // full - ПОЛНАЯ СТАТИСТИКА, mini_1 - 3 ПАРАМЕТРА, mini_2 - FPS ПОЛНЫЙ, fps - FPS ЧИСЛО
let debug_max_min=5; // С КАКИМ ИНТЕРВАЛОМ В СЕКУНДАХ, ОБНОВЛЯТЬ МАКСИМАЛЬНОЕ И МИНИМАЛЬНОЕ ЗАТРАЧЕННОЕ ВРЕМЯ
let debug_now=0.2; // С КАКИМ ИНТЕРВАЛОМ В СЕКУНДАХ, ОБНОВЛЯТЬ ТЕКУЩЕЕ ЗАТРАЧЕННОЕ ВРЕМЯ
let debug=[];
let debug_text=[];
let debug_body;


//____________________ ДОБАВЛЕНИЕ ОТДЕЛЬНОГО ТЕКСТА С ДАННЫМИ ____________________


function debug_text_add(value){
	
	
if(!debug_show || debug_mode!="full"){ return; }
debug_text.push(value);


}


//____________________ ЗАПУСК ____________________


function debug_init(){
	
	
if(!debug_show){ return; }
	

if(debug_mode=="full"){
let element=document.createElement("table");
element.setAttribute("class","debug_full");
element.setAttribute("cellpadding","0px");
element.setAttribute("cellspacing","0px");
element.innerHTML='<tbody id="debug_body"></tbody>';
project.appendChild(element);
debug_body=document.getElementById("debug_body");
}


if(debug_mode=="mini_1"){
let element=document.createElement("table");
element.setAttribute("class","debug_mini_1");
element.setAttribute("cellpadding","0px");
element.setAttribute("cellspacing","0px");
element.innerHTML='<tbody id="debug_body"></tbody>';
project.appendChild(element);
debug_body=document.getElementById("debug_body");
}


if(debug_mode=="mini_2"){
let element=document.createElement("table");
element.setAttribute("class","debug_mini_1");
element.setAttribute("cellpadding","0px");
element.setAttribute("cellspacing","0px");
element.innerHTML='<tbody id="debug_body"></tbody>';
project.appendChild(element);
debug_body=document.getElementById("debug_body");
}


if(debug_mode=="fps"){
let element=document.createElement("div");
element.setAttribute("class","debug_fps");
element.setAttribute("id","debug_body");
project.appendChild(element);
debug_body=document.getElementById("debug_body");
}


}


//____________________ УСТАНОВКА СВОЙСТВ ____________________


function debug_set(title,name){
	

if(!debug_show){ return; }
if(debug_mode=="mini_1" && name!="javascript" && name!="renderer" && name!="fps"){ return; }
if(debug_mode=="mini_2" && name!="fps"){ return; }
if(debug_mode=="fps" && name!="fps"){ return; }


debug[name]={};
if(name=="fps"){
debug[name].fps_elapsed=0;
debug[name].fps_now=0;
debug[name].fps_last=0;	
debug[name].start=function(){
debug[name].start_time=performance.now();
debug[name].fps_elapsed+=delta;
if(debug[name].fps_elapsed>0.5){ debug[name].fps_elapsed=0; debug[name].fps_now=(1000/(performance.now()-debug[name].fps_last)).toFixed(2); }
debug[name].fps_last=performance.now();
}
}
else{
debug[name].start=function(){ debug[name].start_time=performance.now(); }
}
debug[name].start_time=0;
debug[name].end;
debug[name].elapsed_now=0;
debug[name].elapsed_max_min=0;
debug[name].max=0;
debug[name].min=1000000;
debug[name].now=0;


if(debug_mode!="full" && debug_mode!="mini_1" && debug_mode!="mini_2"){ return; }


let tr=document.createElement("tr");
let td=document.createElement("td");
td.innerHTML=title;
tr.appendChild(td);
td=document.createElement("td");
td.setAttribute("id",name);
tr.appendChild(td);
debug_body.appendChild(tr);	


debug[name].element=document.getElementById(name);


}


//____________________ ЗАПИСЬ ВРЕМЕНИ СТАРТА ____________________


function debug_start(name){
	
	
if(!debug_show){ return; }
if(debug_mode=="mini_1" && name!="javascript" && name!="renderer" && name!="fps"){ return; }
if(debug_mode=="mini_2" && name!="fps"){ return; }
if(debug_mode=="fps" && name!="fps"){ return; }
debug[name].start();

	
}
	
	
//____________________ ПОДСЧЁТ ДАННЫХ ____________________


function debug_end(name,arg){
	

if(!debug_show){ return; }
if(debug_mode=="mini_1" && name!="javascript" && name!="renderer" && name!="fps"){ return; }
if(debug_mode=="mini_2" && name!="fps"){ return; }
if(debug_mode=="fps" && name!="fps"){ return; }

	
let item=debug[name];
let end=Number((performance.now()-item.start_time).toFixed(3));
if(name=="fps"){ arg=debug[name].fps_now; }
if(debug_mode=="fps"){ debug_body.innerHTML=arg; return; } 
if(end>item.max){ item.max=end; }
if(end<item.min){ item.min=end; }
item.elapsed_max_min+=delta;
item.elapsed_now+=delta;
if(item.elapsed_max_min>debug_max_min){ item.elapsed_max_min=0; item.max=0.001; item.min=100; }
if(item.elapsed_now>debug_now){ item.elapsed_now=0; item.now=end; }
let text="<font></font> "; 
if(arg!=null){ text="<font>["+arg+"]</font> "; }
let min=item.min;
if(min==100){ min=7.777; }
else{ min=item.min.toFixed(3); } 
text+="max: <span>"+item.max.toFixed(3)+"</span> min: <span>"+min+"</span> now: <span>"+item.now.toFixed(3)+"</span>";
debug_text.push([name,text]);


}


//____________________ ОТОБРАЖЕНИЕ ____________________


function debug_final_show(){
	
	
if(!debug_show || debug_mode=="fps"){ return; }


let max=debug_text.length;
for(let n=0;n<max;n++){
let item=debug_text[n];
debug[item[0]].element.innerHTML=item[1];
}
debug_text=[];


}