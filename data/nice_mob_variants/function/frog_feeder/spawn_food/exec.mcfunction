scoreboard players set @s nice_mob_variants.frog_feeder 1
playsound minecraft:block.creaking_heart.spawn block @a ~ ~ ~ 0.5 0.1

setblock ~ ~-1 ~ minecraft:petrified_oak_slab[type=top]

execute store result score $frog_feeder_1 nice_mob_variants.technical run random value 1..4
execute store result score $frog_feeder_2 nice_mob_variants.technical run random value 1..4
execute store result score $frog_feeder_3 nice_mob_variants.technical run random value 1..4
execute store result score $frog_feeder_4 nice_mob_variants.technical run random value 1..4

execute if block ~ ~-1 ~1 #nice_mob_variants:safe_for_frog_food unless score $frog_feeder_1 nice_mob_variants.technical matches 4 run particle minecraft:poof ~ ~-1 ~1 0.1 0.1 0.1 0 5
execute if block ~ ~-1 ~-1 #nice_mob_variants:safe_for_frog_food unless score $frog_feeder_2 nice_mob_variants.technical matches 4 run particle minecraft:poof ~ ~-1 ~-1 0.1 0.1 0.1 0 5
execute if block ~1 ~-1 ~ #nice_mob_variants:safe_for_frog_food unless score $frog_feeder_3 nice_mob_variants.technical matches 4 run particle minecraft:poof ~1 ~-1 ~ 0.1 0.1 0.1 0 5
execute if block ~-1 ~-1 ~ #nice_mob_variants:safe_for_frog_food unless score $frog_feeder_4 nice_mob_variants.technical matches 4 run particle minecraft:poof ~-1 ~-1 ~ 0.1 0.1 0.1 0 5

execute if block ~ ~-1 ~1 #nice_mob_variants:safe_for_frog_food if score $frog_feeder_1 nice_mob_variants.technical matches 1 run summon magma_cube ~ ~-1 ~1 {size:0}
execute if block ~ ~-1 ~-1 #nice_mob_variants:safe_for_frog_food if score $frog_feeder_2 nice_mob_variants.technical matches 1 run summon magma_cube ~ ~-1 ~-1 {size:0}
execute if block ~1 ~-1 ~ #nice_mob_variants:safe_for_frog_food if score $frog_feeder_3 nice_mob_variants.technical matches 1 run summon magma_cube ~1 ~-1 ~ {size:0}
execute if block ~-1 ~-1 ~ #nice_mob_variants:safe_for_frog_food if score $frog_feeder_4 nice_mob_variants.technical matches 1 run summon magma_cube ~-1 ~-1 ~ {size:0}

execute if block ~ ~-1 ~1 #nice_mob_variants:safe_for_frog_food if score $frog_feeder_1 nice_mob_variants.technical matches 2 run summon silverfish ~ ~-1 ~1
execute if block ~ ~-1 ~-1 #nice_mob_variants:safe_for_frog_food if score $frog_feeder_2 nice_mob_variants.technical matches 2 run summon silverfish ~ ~-1 ~-1
execute if block ~1 ~-1 ~ #nice_mob_variants:safe_for_frog_food if score $frog_feeder_3 nice_mob_variants.technical matches 2 run summon silverfish ~1 ~-1 ~
execute if block ~-1 ~-1 ~ #nice_mob_variants:safe_for_frog_food if score $frog_feeder_4 nice_mob_variants.technical matches 2 run summon silverfish ~-1 ~-1 ~

execute if block ~ ~-1 ~1 #nice_mob_variants:safe_for_frog_food if score $frog_feeder_1 nice_mob_variants.technical matches 3 run summon endermite ~ ~-1 ~1
execute if block ~ ~-1 ~-1 #nice_mob_variants:safe_for_frog_food if score $frog_feeder_2 nice_mob_variants.technical matches 3 run summon endermite ~ ~-1 ~-1
execute if block ~1 ~-1 ~ #nice_mob_variants:safe_for_frog_food if score $frog_feeder_3 nice_mob_variants.technical matches 3 run summon endermite ~1 ~-1 ~
execute if block ~-1 ~-1 ~ #nice_mob_variants:safe_for_frog_food if score $frog_feeder_4 nice_mob_variants.technical matches 3 run summon endermite ~-1 ~-1 ~

setblock ~ ~-1 ~ minecraft:petrified_oak_slab[type=double]