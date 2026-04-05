schedule function nice_mob_variants:livestock_breeder/breed/init 60s

scoreboard players add @e[type=minecraft:item_display,tag=nice_mob_variants.livestock_breeder.block] nice_mob_variants.livestock_breeder 1
execute as @e[type=minecraft:item_display,tag=nice_mob_variants.livestock_breeder.block,scores={nice_mob_variants.livestock_breeder=10..}] at @s run function nice_mob_variants:livestock_breeder/breed/prep