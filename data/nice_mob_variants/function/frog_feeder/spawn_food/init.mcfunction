schedule function nice_mob_variants:frog_feeder/spawn_food/init 1s

scoreboard players add @e[type=minecraft:item_display,tag=nice_mob_variants.frog_feeder.block] nice_mob_variants.frog_feeder 1

execute as @e[type=minecraft:item_display,tag=nice_mob_variants.frog_feeder.block,scores={nice_mob_variants.frog_feeder=120..}] at @s \
    if predicate nice_mob_variants:percentages/10 \
        if entity @e[type=player,distance=..64] \
            run function nice_mob_variants:frog_feeder/spawn_food/exec