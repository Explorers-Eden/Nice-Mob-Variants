execute as @e[type=#nice_mob_variants:is_livestock,distance=..12] store result score @s nice_mob_variants.livestock_breeder run data get entity @s InLove
execute as @e[type=#nice_mob_variants:is_livestock,distance=..12,scores={nice_mob_variants.livestock_breeder=..0}] at @s run function nice_mob_variants:livestock_breeder/breed/exec

setblock ~ ~-1 ~ minecraft:petrified_oak_slab[type=top]

scoreboard players set @s nice_mob_variants.livestock_breeder 0
particle minecraft:happy_villager ~ ~-0.5 ~ 0.5 0.5 0.5 0.3 20
playsound minecraft:block.azalea_leaves.break block @a ~ ~ ~ 1 0.4

setblock ~ ~-1 ~ minecraft:petrified_oak_slab[type=double]